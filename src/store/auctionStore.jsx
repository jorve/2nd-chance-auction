import { create } from 'zustand'
import { LDB_DATA } from '../data/ldb_data.js'
import { norm } from '../utils/norm.js'

const LEAGUE_MIN_BID = 0.5
const IN_SEASON_CARRY_RESERVE = 5.0

function effectiveAuctionBudgetForValuation(teamState) {
  const budget = parseFloat(teamState?.budget_current) || 0
  const slots = Math.max(0, parseInt(teamState?.slots_current ?? 0, 10) || 0)
  const requiredReserve = (slots * LEAGUE_MIN_BID) + IN_SEASON_CARRY_RESERVE
  return Math.max(0, budget - requiredReserve)
}

function reserveAwareMaxBid(teamState) {
  const budget = parseFloat(teamState?.budget_current) || 0
  const slots = Math.max(0, parseInt(teamState?.slots_current ?? 0, 10) || 0)
  if (slots <= 0) return 0
  const reserveAfterThisPurchase = ((slots - 1) * LEAGUE_MIN_BID) + IN_SEASON_CARRY_RESERVE
  return Math.max(0, Math.min(budget, budget - reserveAfterThisPurchase))
}

// Tunables for below-replacement valuation behavior.
const NEGATIVE_VALUE_CONFIG = {
  priorityBoostScale: 1.5,
  rawShareScale: 0.35,
  batter: [
    { key: 'obp',  inv: false, w: 1.0 },
    { key: 'ops',  inv: false, w: 1.0 },
    { key: 'asb',  inv: false, w: 0.45 },
  ],
  sp: [
    { key: 'era',  inv: true,  w: 1.0 },
    { key: 'whip', inv: true,  w: 1.0 },
    { key: 'mgs',  inv: false, w: 0.75 },
  ],
  rp: [
    { key: 'era',   inv: true,  w: 1.0 },
    { key: 'whip',  inv: true,  w: 1.0 },
    { key: 'vijay', inv: false, w: 0.75 },
  ],
}

// ── VALUATION ENGINE ────────────────────────────────────────────────────────
function recalcAllValues(batters, sp, rp, teams, soldMap) {
  const effectiveAuctionBudgetByTeam = {}
  for (const [team, t] of Object.entries(teams)) {
    effectiveAuctionBudgetByTeam[team] = effectiveAuctionBudgetForValuation(t)
  }
  const totalEffectiveAuctionBudget = Object.values(effectiveAuctionBudgetByTeam).reduce((s, v) => s + v, 0)
  if (totalEffectiveAuctionBudget <= 0) {
    return {
      batters: batters.map(p => ({ ...p })),
      sp:      sp.map(p => ({ ...p })),
      rp:      rp.map(p => ({ ...p })),
    }
  }

  const unsoldBatters = batters.filter(p => !soldMap[p.name])
  const unsoldSP      = sp.filter(p => !soldMap[p.name])
  const unsoldRP      = rp.filter(p => !soldMap[p.name])

  const roundHalf = v => Math.round(v * 2) / 2
  const roundTenth = v => Math.round(v * 10) / 10
  const safeNum = v => {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  const computePriorityScores = (group, defs) => {
    const out = new Map(group.map(p => [p.name, 0]))
    if (!group.length || !defs?.length) return out
    for (const d of defs) {
      const vals = group.map(p => safeNum(p[d.key]))
      if (!vals.length) continue
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length
      const stdev = Math.sqrt(variance)
      if (!stdev) continue
      for (const p of group) {
        const raw = safeNum(p[d.key])
        const z = d.inv ? (mean - raw) / stdev : (raw - mean) / stdev
        out.set(p.name, (out.get(p.name) ?? 0) + z * d.w)
      }
    }
    return out
  }
  const rawVorp = p => (p.ldb_score - (p.repl_level ?? 0))
  const positiveVorp = p => Math.max(0, rawVorp(p))
  const sumPositiveVorp = (group) => group.reduce((s, p) => s + positiveVorp(p), 0)
  const totalPositiveVorpAll =
    sumPositiveVorp(unsoldBatters) +
    sumPositiveVorp(unsoldSP) +
    sumPositiveVorp(unsoldRP)
  const hitBudget = totalPositiveVorpAll > 0
    ? totalEffectiveAuctionBudget * (sumPositiveVorp(unsoldBatters) / totalPositiveVorpAll)
    : totalEffectiveAuctionBudget / 3
  const spBudget = totalPositiveVorpAll > 0
    ? totalEffectiveAuctionBudget * (sumPositiveVorp(unsoldSP) / totalPositiveVorpAll)
    : totalEffectiveAuctionBudget / 3
  const rpBudget = totalPositiveVorpAll > 0
    ? totalEffectiveAuctionBudget * (sumPositiveVorp(unsoldRP) / totalPositiveVorpAll)
    : totalEffectiveAuctionBudget / 3
  const allocGroup = (group, budget, negativePriorityScores = new Map()) => {
    const totalPositiveVorp = group.reduce((s, p) => s + positiveVorp(p), 0)
    if (!totalPositiveVorp) {
      // Keep the board differentiated when everyone in a pool grades below replacement.
      return new Map(group.map(p => [p.name, roundTenth(Math.min(0, rawVorp(p)))]))
    }
    const dollarsPerVorp = budget / totalPositiveVorp
    const out = new Map()
    for (const p of group) {
      const pv = rawVorp(p)
      const rawShare = pv * dollarsPerVorp
      // Positive values still honor the auction floor, negatives are shown on the board.
      if (pv > 0) {
        out.set(p.name, Math.max(0.5, roundHalf(rawShare)))
        continue
      }
      // Below replacement: emphasize "stability" categories for ordering.
      const priorityBoost = (negativePriorityScores.get(p.name) ?? 0) * NEGATIVE_VALUE_CONFIG.priorityBoostScale
      const adjusted = (rawShare * NEGATIVE_VALUE_CONFIG.rawShareScale) + priorityBoost
      out.set(p.name, roundTenth(Math.min(0, adjusted)))
    }
    return out
  }

  const batterNegPriority = computePriorityScores(unsoldBatters, NEGATIVE_VALUE_CONFIG.batter)
  const spNegPriority = computePriorityScores(unsoldSP, NEGATIVE_VALUE_CONFIG.sp)
  const rpNegPriority = computePriorityScores(unsoldRP, NEGATIVE_VALUE_CONFIG.rp)

  const adjBatters = allocGroup(unsoldBatters, hitBudget, batterNegPriority)
  const adjSP = allocGroup(unsoldSP, spBudget, spNegPriority)
  const adjRP = allocGroup(unsoldRP, rpBudget, rpNegPriority)

  const applyAdj = (players, adjMap) => players.map(p => ({
    ...p,
    adj_value: soldMap[p.name]
      ? soldMap[p.name].price
      : (adjMap.get(p.name) ?? p.est_value),
  }))

  return {
    batters: applyAdj(batters, adjBatters),
    sp: applyAdj(sp, adjSP),
    rp: applyAdj(rp, adjRP),
  }
}

// ── INITIAL STATE ──────────────────────────────────────────────────────────
function buildInitialTeams() {
  const teams = {}
  Object.entries(LDB_DATA.teams).forEach(([abbr, t]) => {
    teams[abbr] = {
      ...t,
      budget_current: t.budget_effective ?? t.budget_rem,  // use effective (after carryover)
      slots_current: t.slots_rem,
    }
  })
  return teams
}

const initialTeams = buildInitialTeams()
const initialRecalc = recalcAllValues(LDB_DATA.batters, LDB_DATA.sp, LDB_DATA.rp, initialTeams, {})
const initialBatters = initialRecalc.batters
const initialSP      = initialRecalc.sp
const initialRP      = initialRecalc.rp

// Load saved session if present
const _saved = loadFromStorage()
const _init  = _saved ? buildStateFromSnapshot(_saved) : null

// ── BID INCREMENT HELPERS ─────────────────────────────────────────────────
// $0.5M steps up to $10M, then $1M steps above $10M
export function snapToValidIncrement(val) {
  const n = parseFloat(val) || 0.5
  if (n <= 10) return Math.max(0.5, Math.round(n * 2) / 2)
  return Math.max(10, Math.round(n))
}
export function stepUp(current) {
  const n = parseFloat(current) || 0
  if (n < 10) return parseFloat((Math.round((n + 0.5) * 2) / 2).toFixed(1))
  return Math.round(n) + 1
}
export function stepDown(current) {
  const n = parseFloat(current) || 1
  if (n <= 10) return Math.max(0.5, parseFloat((Math.round((n - 0.5) * 2) / 2).toFixed(1)))
  return Math.max(10, Math.round(n) - 1)
}
export function isValidBidPrice(val) {
  const n = parseFloat(val)
  if (isNaN(n) || n < 0.5) return false
  if (n <= 10) return Math.abs((n * 2) - Math.round(n * 2)) < 0.001
  return Math.abs(n - Math.round(n)) < 0.001
}
export function fmtPrice(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return n % 1 === 0 ? `$${n}M` : `$${n.toFixed(1)}M`
}


// ── PERSISTENCE ────────────────────────────────────────────────────────────
const LS_KEY = 'ldb_auction_2026'

function saveToStorage(sold, teams, auctionLog, currentNominator, targetAvoid) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      v: 1,
      savedAt: Date.now(),
      sold,
      teams,
      auctionLog,
      currentNominator: currentNominator || undefined,
      targetAvoid: targetAvoid && Object.keys(targetAvoid).length > 0 ? targetAvoid : undefined,
    }))
  } catch (e) {
    console.warn('LDB: localStorage save failed', e)
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.v !== 1 || !parsed.sold || !parsed.teams) return null
    const log = parsed.auctionLog || []
    const teamsList = Object.keys(parsed.teams || {}).sort()
    for (let i = 0; i < log.length; i++) {
      if (!log[i].nominatedBy && teamsList.length) {
        log[i].nominatedBy = teamsList[i % teamsList.length]
      }
    }
    return {
      ...parsed,
      auctionLog: log,
      currentNominator: parsed.currentNominator || '',
      targetAvoid: parsed.targetAvoid || {},
    }
  } catch {
    return null
  }
}

export function clearStorage() {
  localStorage.removeItem(LS_KEY)
}

export function exportAuctionJSON() {
  const raw = localStorage.getItem(LS_KEY)
  if (!raw) return
  const blob = new Blob([raw], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
  a.href     = url
  a.download = `ldb_auction_${ts}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importAuctionJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result)
        if (parsed?.v !== 1 || !parsed.sold || !parsed.teams) {
          reject(new Error('Invalid auction file format'))
          return
        }
        localStorage.setItem(LS_KEY, e.target.result)
        resolve(parsed)
      } catch {
        reject(new Error('Could not parse auction file'))
      }
    }
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsText(file)
  })
}

export function hasSavedSession() {
  const saved = loadFromStorage()
  return saved && Object.keys(saved.sold || {}).length > 0
}

export function savedSessionMeta() {
  const saved = loadFromStorage()
  if (!saved) return null
  return {
    soldCount: Object.keys(saved.sold || {}).length,
    savedAt: saved.savedAt,
  }
}

// Rebuild state from a saved snapshot + fresh player data
function buildStateFromSnapshot(snapshot) {
  const { sold, teams, auctionLog } = snapshot
  const recalced = recalcAllValues(LDB_DATA.batters, LDB_DATA.sp, LDB_DATA.rp, teams, sold)
  const batters = recalced.batters
  const sp      = recalced.sp
  const rp      = recalced.rp
  return { sold, teams, auctionLog, batters, sp, rp }
}

// ── STORE ──────────────────────────────────────────────────────────────────
export const useAuctionStore = create((set, get) => ({
  // Data — restored from localStorage if available
  batters: _init?.batters ?? initialBatters,
  sp:      _init?.sp      ?? initialSP,
  rp:      _init?.rp      ?? initialRP,

  // Live auction state
  teams:      _init?.teams      ?? initialTeams,
  sold:       _init?.sold       ?? {},    // { playerName: { price, team, pos_type } }
  auctionLog: _init?.auctionLog ?? [],   // [{ playerName, price, team, nominatedBy, ts, rank, est_value }]
  currentNominator: _saved?.currentNominator ?? '',
  
  // Manual player notes (persisted to player_notes.json via API)
  manualNotes: {},

  // Target/avoid flags (persisted)
  targetAvoid: _saved?.targetAvoid ?? {},

  // UI state
  rankingsTab: 'batters',
  projSystem: 'batx',   // 'batx' | 'oopsy' | 'both'
  fryLens: false,
  searchQuery: '',
  tierFilter: new Set([1, 2, 3, 4, 5]),
  
  // Auction form
  nominatedPlayer: null,
  bidTeam: '',
  bidPrice: '',
  nominatedBy: '',       // team that put player on block (for auction log)
  currentNominator: '',  // next team to nominate (round-robin)

  // ── MANUAL NOTES ──────────────────────────────────────────────────────────
  fetchManualNotes: async () => {
    try {
      const r = await fetch('/api/player-notes')
      if (!r.ok) throw new Error(r.statusText)
      const d = await r.json()
      set({ manualNotes: d.manual_notes || {} })
    } catch {
      set({ manualNotes: {} })
    }
  },
  setManualNote: async (playerName, note) => {
    try {
      const r = await fetch('/api/player-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName, note: note || '' }),
      })
      if (!r.ok) throw new Error(r.statusText)
      const d = await r.json()
      set({ manualNotes: d.manual_notes || {} })
      return true
    } catch (e) {
      console.warn('LDB: Failed to save manual note', e)
      return false
    }
  },
  deleteManualNote: async (playerName) => {
    try {
      const r = await fetch(`/api/player-notes?name=${encodeURIComponent(playerName)}`, {
        method: 'DELETE',
      })
      if (!r.ok) throw new Error(r.statusText)
      const d = await r.json()
      set({ manualNotes: d.manual_notes || {} })
      return true
    } catch (e) {
      console.warn('LDB: Failed to delete manual note', e)
      return false
    }
  },
  getNoteForPlayer: (playerName) => {
    const { manualNotes } = get()
    const key = norm(playerName)
    return manualNotes[key] ?? null
  },
  hasManualNote: (playerName) => {
    const { manualNotes } = get()
    return norm(playerName) in manualNotes
  },

  // ── ACTIONS ──────────────────────────────────────────────────────────────
  setRankingsTab: tab => set({ rankingsTab: tab, searchQuery: '' }),
  setProjSystem: sys => set({ projSystem: sys }),
  toggleFryLens: () => set(s => ({ fryLens: !s.fryLens })),
  setSearch: q => set({ searchQuery: q }),
  toggleTier: tier => set(s => {
    const next = new Set(s.tierFilter)
    next.has(tier) ? next.delete(tier) : next.add(tier)
    return { tierFilter: next }
  }),
  setNominatedPlayer: player => {
    const nominationFloor = 0.5
    const nominated = player
      ? { ...player, adj_value: Math.max(nominationFloor, player.adj_value ?? player.est_value ?? nominationFloor) }
      : null
    return set({
      nominatedPlayer: nominated,
      // Nominations cannot open below league minimum.
      bidPrice: nominated ? snapToValidIncrement(nominated.adj_value ?? nominated.est_value ?? nominationFloor) : nominationFloor,
      bidTeam: '',
    })
  },
  setBidTeam: t => set({ bidTeam: t }),
  setBidPrice: p => set({ bidPrice: p }),
  setNominatedBy: team => set({ nominatedBy: team }),
  setCurrentNominator: team => set({ currentNominator: team }),

  toggleTargetAvoid: (playerName, flag) => {
    const { targetAvoid } = get()
    const next = { ...targetAvoid }
    if (flag === null) delete next[playerName]
    else next[playerName] = flag
    set({ targetAvoid: next })
    saveToStorage(get().sold, get().teams, get().auctionLog, get().currentNominator, next)
  },
  getTargetAvoid: (playerName) => get().targetAvoid[playerName] ?? null,
  getMaxBidForTeam: (team) => reserveAwareMaxBid(get().teams[team]),

  confirmSale: () => {
    const { nominatedPlayer, bidTeam, bidPrice, sold, auctionLog, teams, nominatedBy, currentNominator, targetAvoid } = get()
    if (!nominatedPlayer || !bidTeam || !bidPrice) return
    const price = parseFloat(bidPrice)
    if (isNaN(price) || price < 0.5) return
    const maxBid = reserveAwareMaxBid(teams[bidTeam])
    if (price > maxBid) return

    const posType = nominatedPlayer.gs !== undefined ? 'sp'
      : nominatedPlayer.pa !== undefined ? 'batter' : 'rp'

    const nominator = nominatedBy || currentNominator || TEAMS_LIST[auctionLog.length % TEAMS_LIST.length]

    const newSold = {
      ...sold,
      [nominatedPlayer.name]: { price, team: bidTeam, pos_type: posType, ts: Date.now() }
    }
    const newTeams = { ...teams }
    if (newTeams[bidTeam]) {
      newTeams[bidTeam] = {
        ...newTeams[bidTeam],
        budget_current: Math.max(0, newTeams[bidTeam].budget_current - price),
        slots_current: Math.max(0, newTeams[bidTeam].slots_current - 1),
      }
    }
    const newLog = [
      {
        playerName: nominatedPlayer.name,
        team_mlb: nominatedPlayer.team,
        price,
        team: bidTeam,
        nominatedBy: nominator,
        pos_type: posType,
        est_value: nominatedPlayer.est_value,
        oopsy_est_value: nominatedPlayer.oopsy_est_value,
        rank: nominatedPlayer.rank,
        ts: Date.now(),
      },
      ...auctionLog,
    ]

    const nextNominator = TEAMS_LIST[(TEAMS_LIST.indexOf(nominator) + 1) % TEAMS_LIST.length]

    const recalc = recalcAllValues(get().batters, get().sp, get().rp, newTeams, newSold)
    const newBatters = recalc.batters
    const newSP      = recalc.sp
    const newRP      = recalc.rp

    saveToStorage(newSold, newTeams, newLog, nextNominator, targetAvoid)
    set({
      sold: newSold,
      teams: newTeams,
      auctionLog: newLog,
      batters: newBatters,
      sp: newSP,
      rp: newRP,
      nominatedPlayer: null,
      bidTeam: '',
      bidPrice: '',
      nominatedBy: '',
      currentNominator: nextNominator,
    })
  },

  undoLastSale: () => {
    const { auctionLog, sold, teams, currentNominator, targetAvoid } = get()
    if (!auctionLog.length) return
    const last = auctionLog[0]
    const newSold = { ...sold }
    delete newSold[last.playerName]
    const newTeams = { ...teams }
    if (newTeams[last.team]) {
      newTeams[last.team] = {
        ...newTeams[last.team],
        budget_current: newTeams[last.team].budget_current + last.price,
        slots_current: newTeams[last.team].slots_current + 1,
      }
    }
    const newLog = auctionLog.slice(1)
    const prevNominator = last.nominatedBy || TEAMS_LIST[(TEAMS_LIST.indexOf(currentNominator || TEAMS_LIST[0]) - 1 + TEAMS_LIST.length) % TEAMS_LIST.length]
    const recalc = recalcAllValues(get().batters, get().sp, get().rp, newTeams, newSold)
    const newBatters = recalc.batters
    const newSP      = recalc.sp
    const newRP      = recalc.rp
    saveToStorage(newSold, newTeams, newLog, prevNominator, targetAvoid)
    set({ sold: newSold, teams: newTeams, auctionLog: newLog, batters: newBatters, sp: newSP, rp: newRP, currentNominator: prevNominator })
  },

  resetAuction: () => {
    const t = buildInitialTeams()
    const recalc = recalcAllValues(LDB_DATA.batters, LDB_DATA.sp, LDB_DATA.rp, t, {})
    clearStorage()
    set({
      teams: t,
      sold: {},
      auctionLog: [],
      batters: recalc.batters,
      sp:      recalc.sp,
      rp:      recalc.rp,
      nominatedPlayer: null,
      bidTeam: '', bidPrice: '',
    })
  },

  // Load a snapshot from an imported file and rebuild state
  restoreFromSnapshot: (snapshot) => {
    const log = snapshot.auctionLog || []
    const teamsList = TEAMS_LIST
    for (let i = 0; i < log.length; i++) {
      if (!log[i].nominatedBy && teamsList.length) log[i].nominatedBy = teamsList[i % teamsList.length]
    }
    const state = buildStateFromSnapshot({ ...snapshot, auctionLog: log })
    const nom = snapshot.currentNominator || ''
    const ta = snapshot.targetAvoid || {}
    saveToStorage(state.sold, state.teams, state.auctionLog, nom, ta)
    set({ ...state, nominatedPlayer: null, bidTeam: '', bidPrice: '', targetAvoid: ta, currentNominator: nom })
  },

  // Derived helpers
  getFryData: () => {
    const { teams, sold } = get()
    const fry = teams['FRY'] || {}
    const fryWins = Object.entries(sold).filter(([, v]) => v.team === 'FRY')
    return {
      budget_current: fry.budget_current ?? 0,
      slots_current: fry.slots_current ?? 0,
      wins: fryWins,
      spend: fryWins.reduce((s, [, v]) => s + v.price, 0),
    }
  },
}))

export const META = LDB_DATA.meta
export const TEAMS_LIST = Object.keys(LDB_DATA.teams).sort()
export const TEAM_COLORS = {
  FRY: '#c8f135', ICHI: '#38bdf8', POLL: '#fb923c', TONES: '#a78bfa',
  WORK: '#4ade80', WIND: '#67e8f9', ROOF: '#fbbf24', AIDS: '#f472b6',
  IPA: '#818cf8', PWRS: '#34d399', IZZY: '#f87171', NATE: '#94a3b8',
  CHOICE: '#e879f9', BALK: '#2dd4bf', NEO: '#fcd34d', CORN: '#86efac',
}

// FRY positional needs from league rules — drives lens priority signals
export const FRY_NEEDS = {
  critical: ['SP', 'SS', '3B'],   // nearly empty / totally open positions
  needed:   ['1B', '2B', 'RP'],   // empty or thin slots
  filled:   ['C', 'RF'],          // Raleigh + Acuña/Rooker covered
}

// Contract code helpers
export function contractLabel(code) {
  if (!code) return null
  if (code === 'K3') return { text: 'K3 · FINAL YEAR', color: 'var(--orange)', isRofr: true }
  if (code === 'HTH') return { text: 'HTH · 1YR ONLY', color: 'var(--red)', isRofr: false }
  if (code === 'K2') return { text: 'K2', color: 'var(--text-dim)', isRofr: false }
  if (code === 'K1') return { text: 'K1', color: 'var(--text-dim)', isRofr: false }
  if (code.match(/^S\d$/)) return { text: code, color: 'var(--purple)', isRofr: false }
  if (code.match(/^H\d$/)) return { text: code, color: 'var(--blue)', isRofr: false }
  return { text: code, color: 'var(--text-dim)', isRofr: false }
}
