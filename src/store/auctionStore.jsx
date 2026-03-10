import { create } from 'zustand'
import { LDB_DATA } from '../data/ldb_data.js'

// ── VALUATION ENGINE ────────────────────────────────────────────────────────
function recalcValues(players, teams, soldMap) {
  // If nothing has been sold yet, just return players with adj_value = est_value.
  // This avoids float-point drift between Python round() and JS Math.round()
  // that would show spurious non-zero deltas at auction start.
  const anySold = Object.keys(soldMap).length > 0
  if (!anySold) {
    return players.map(p => ({ ...p, adj_value: p.est_value }))
  }

  // Total remaining budget across all teams
  const totalRemaining = Object.values(teams).reduce((s, t) => s + t.budget_current, 0)

  // Unsold players
  const unsold = players.filter(p => !soldMap[p.name])
  if (!unsold.length || totalRemaining <= 0) return players.map(p => ({ ...p }))

  // Split by type for budget allocation
  const isBatter = p => p.pa !== undefined
  const isSP     = p => p.gs !== undefined

  const hitBudget = totalRemaining * 0.50
  const spBudget  = totalRemaining * 0.30
  const rpBudget  = totalRemaining * 0.20

  function allocGroup(group, budget) {
    const positiveTotal = group.reduce((s, p) => s + Math.max(0, p.ldb_score), 0)
    if (!positiveTotal) return group.map(p => ({ ...p, adj_value: 0.5 }))
    return group.map(p => ({
      ...p,
      adj_value: p.ldb_score > 0
        ? Math.max(0.5, Math.round((p.ldb_score / positiveTotal) * budget * 2) / 2)
        : 0.5
    }))
  }

  const unsoldBatters = unsold.filter(isBatter)
  const unsoldSP      = unsold.filter(isSP)
  const unsoldRP      = unsold.filter(p => !isBatter(p) && !isSP(p))

  const adjBatters = allocGroup(unsoldBatters, hitBudget)
  const adjSP      = allocGroup(unsoldSP, spBudget)
  const adjRP      = allocGroup(unsoldRP, rpBudget)

  const adjMap = {}
  ;[...adjBatters, ...adjSP, ...adjRP].forEach(p => { adjMap[p.name] = p.adj_value })

  return players.map(p => ({
    ...p,
    adj_value: soldMap[p.name]
      ? soldMap[p.name].price
      : (adjMap[p.name] ?? p.est_value)
  }))
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
const initialBatters = recalcValues(LDB_DATA.batters, initialTeams, {})
const initialSP      = recalcValues(LDB_DATA.sp,      initialTeams, {})
const initialRP      = recalcValues(LDB_DATA.rp,      initialTeams, {})

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

function saveToStorage(sold, teams, auctionLog) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      v: 1,
      savedAt: Date.now(),
      sold,
      teams,
      auctionLog,
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
    return parsed
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
  const batters = recalcValues(LDB_DATA.batters, teams, sold)
  const sp      = recalcValues(LDB_DATA.sp,      teams, sold)
  const rp      = recalcValues(LDB_DATA.rp,      teams, sold)
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
  auctionLog: _init?.auctionLog ?? [],   // [{ playerName, price, team, ts, rank, est_value }]
  
  // UI state
  activeTab: 'rankings',
  rankingsTab: 'batters',
  projSystem: 'batx',   // 'batx' | 'oopsy' | 'both'
  fryLens: false,
  searchQuery: '',
  tierFilter: new Set([1, 2, 3, 4, 5]),
  
  // Auction form
  nominatedPlayer: null,
  bidTeam: '',
  bidPrice: '',

  // ── ACTIONS ──────────────────────────────────────────────────────────────
  setActiveTab: tab => set({ activeTab: tab }),
  setRankingsTab: tab => set({ rankingsTab: tab, searchQuery: '' }),
  setProjSystem: sys => set({ projSystem: sys }),
  toggleFryLens: () => set(s => ({ fryLens: !s.fryLens })),
  setSearch: q => set({ searchQuery: q }),
  toggleTier: tier => set(s => {
    const next = new Set(s.tierFilter)
    next.has(tier) ? next.delete(tier) : next.add(tier)
    return { tierFilter: next }
  }),
  setNominatedPlayer: player => set({
    nominatedPlayer: player,
    bidPrice: player ? snapToValidIncrement(player.adj_value ?? player.est_value ?? 1) : 0.5,
    bidTeam: '',
  }),
  setBidTeam: t => set({ bidTeam: t }),
  setBidPrice: p => set({ bidPrice: p }),

  confirmSale: () => {
    const { nominatedPlayer, bidTeam, bidPrice, sold, auctionLog, teams } = get()
    if (!nominatedPlayer || !bidTeam || !bidPrice) return
    const price = parseFloat(bidPrice)
    if (isNaN(price) || price < 0.5) return

    const posType = nominatedPlayer.gs !== undefined ? 'sp'
      : nominatedPlayer.pa !== undefined ? 'batter' : 'rp'

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
        pos_type: posType,
        est_value: nominatedPlayer.est_value,
        oopsy_est_value: nominatedPlayer.oopsy_est_value,
        rank: nominatedPlayer.rank,
        ts: Date.now(),
      },
      ...auctionLog,
    ]

    const newBatters = recalcValues(get().batters, newTeams, newSold)
    const newSP      = recalcValues(get().sp,      newTeams, newSold)
    const newRP      = recalcValues(get().rp,      newTeams, newSold)

    saveToStorage(newSold, newTeams, newLog)
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
    })
  },

  undoLastSale: () => {
    const { auctionLog, sold, teams } = get()
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
    const newBatters = recalcValues(get().batters, newTeams, newSold)
    const newSP      = recalcValues(get().sp,      newTeams, newSold)
    const newRP      = recalcValues(get().rp,      newTeams, newSold)
    saveToStorage(newSold, newTeams, newLog)
    set({ sold: newSold, teams: newTeams, auctionLog: newLog, batters: newBatters, sp: newSP, rp: newRP })
  },

  resetAuction: () => {
    const t = buildInitialTeams()
    clearStorage()
    set({
      teams: t,
      sold: {},
      auctionLog: [],
      batters: recalcValues(LDB_DATA.batters, t, {}),
      sp:      recalcValues(LDB_DATA.sp,      t, {}),
      rp:      recalcValues(LDB_DATA.rp,      t, {}),
      nominatedPlayer: null,
      bidTeam: '', bidPrice: '',
    })
  },

  // Load a snapshot from an imported file and rebuild state
  restoreFromSnapshot: (snapshot) => {
    const state = buildStateFromSnapshot(snapshot)
    saveToStorage(state.sold, state.teams, state.auctionLog)
    set({ ...state, nominatedPlayer: null, bidTeam: '', bidPrice: '' })
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
  critical: ['SP', 'RP'],   // nearly empty / zero VIJAY
  needed:   ['SS', '2B'],   // positional gaps
  filled:   ['C', 'RF', '3B', '1B'],
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
