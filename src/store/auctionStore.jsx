import { create } from 'zustand'
import { LDB_DATA } from '../data/ldb_data.js'
import {
  USE_CUSTOM_LEAGUE,
  SNAKE_TEAM_ORDER,
  SNAKE_DRAFT_ORDER,
  MY_TEAM_ABBR,
  TEAM_COLORS_BY_ABBR,
} from '../config/snakeDraftOrder.js'
import { norm } from '../utils/norm.js'
import {
  getNthLivePick,
  getKeeperRoundsByAbbr,
  buildLivePickTeamSequence,
} from '../utils/snakeLivePicks.js'
import { canStarterHitterFitTeam } from '../utils/hitterSlotting.js'

const LDB_TEAMS_SORTED = Object.keys(LDB_DATA.teams).sort()

/** All teams shown in UI (sorted). Custom league = configured snake teams only. */
const ALL_TEAMS_SORTED = USE_CUSTOM_LEAGUE
  ? [...SNAKE_TEAM_ORDER].sort()
  : LDB_TEAMS_SORTED

/** Snake pick order (see `src/config/snakeDraftOrder.js`). */
const SNAKE_ORDER_ACTIVE =
  USE_CUSTOM_LEAGUE && SNAKE_TEAM_ORDER.length > 0
    ? [...SNAKE_TEAM_ORDER]
    : SNAKE_TEAM_ORDER.length > 0 && SNAKE_TEAM_ORDER.every((a) => LDB_DATA.teams[a])
      ? [...SNAKE_TEAM_ORDER]
      : LDB_TEAMS_SORTED

const LEAGUE_MIN_BID = 0.5
const IN_SEASON_CARRY_RESERVE = 5.0
const RP_VALUE_SCALE = 0.5

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

// Opportunity-cost model for positive valuations:
// premium raw shares are discounted, then re-normalized to pool budget.
const OPPORTUNITY_COST_CONFIG = {
  enabled: true,
  premiumStartMultiple: 3.0, // start discounting above ~3x average slot spend
  alpha: 0.3,                // higher => stronger discount on expensive players
  curve: 'log',              // softer than linear penalty ramp
  minPenalty: 0.75,          // keep floor so stars are not overly crushed
}

// ── VALUATION ENGINE ────────────────────────────────────────────────────────
function recalcAllValues(batters, sp, rp, teams, soldMap, riskAdj = false) {
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

  const soldValues = Object.values(soldMap)
  let soldBatters = 0, soldSP = 0, soldRP = 0
  for (const s of soldValues) {
    if (s.pos_type === 'batter') soldBatters += 1
    else if (s.pos_type === 'sp') soldSP += 1
    else if (s.pos_type === 'rp') soldRP += 1
  }
  const numTeams = Object.keys(teams).length
  const BATTER_SLOTS_PER_TEAM = 13 // CBS active: 13 hitters (incl. MI, CI, 5×OF, U, …)
  const SP_SLOTS_PER_TEAM = 6
  const RP_SLOTS_PER_TEAM = 3 // 6+3 = 9 pitchers
  const batterSlotsToFill = Math.max(0, BATTER_SLOTS_PER_TEAM * numTeams - soldBatters)
  const spSlotsToFill = Math.max(0, SP_SLOTS_PER_TEAM * numTeams - soldSP)
  const rpSlotsToFill = Math.max(0, RP_SLOTS_PER_TEAM * numTeams - soldRP)

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
  // When riskAdj is on, apply each player's vol_mult (1.0 = neutral, <1.0 = risky discount)
  const positiveVorp = p => {
    const v = Math.max(0, rawVorp(p))
    if (!riskAdj) return v
    const mult = safeNum(p.vol_mult)
    return v * (mult > 0 ? mult : 1.0)
  }
  const demandLimitedPositiveMass = (group, slotsToFill) => {
    if (!group.length || slotsToFill <= 0) return 0
    const top = group
      .map(positiveVorp)
      .filter(v => v > 0)
      .sort((a, b) => b - a)
      .slice(0, slotsToFill)
    return top.reduce((s, v) => s + v, 0)
  }
  const batterMass = demandLimitedPositiveMass(unsoldBatters, batterSlotsToFill)
  const spMass = demandLimitedPositiveMass(unsoldSP, spSlotsToFill)
  const rpMass = demandLimitedPositiveMass(unsoldRP, rpSlotsToFill) * RP_VALUE_SCALE
  const totalMass = batterMass + spMass + rpMass
  const hitBudget = totalMass > 0
    ? totalEffectiveAuctionBudget * (batterMass / totalMass)
    : totalEffectiveAuctionBudget / 3
  const spBudget = totalMass > 0
    ? totalEffectiveAuctionBudget * (spMass / totalMass)
    : totalEffectiveAuctionBudget / 3
  const rpBudget = totalMass > 0
    ? totalEffectiveAuctionBudget * (rpMass / totalMass)
    : totalEffectiveAuctionBudget / 3
  const allocGroup = (group, budget, negativePriorityScores = new Map(), slotsToFill = 0) => {
    const totalPositiveVorp = group.reduce((s, p) => s + positiveVorp(p), 0)
    if (!totalPositiveVorp) {
      // Keep the board differentiated when everyone in a pool grades below replacement.
      return new Map(group.map(p => [p.name, roundTenth(Math.min(0, rawVorp(p)))]))
    }
    const dollarsPerVorp = budget / totalPositiveVorp
    const positivePlayers = group.filter(p => rawVorp(p) > 0)
    const linearRawByName = new Map()
    for (const p of positivePlayers) {
      linearRawByName.set(p.name, rawVorp(p) * dollarsPerVorp)
    }
    let adjustedPositiveByName = new Map(linearRawByName)
    if (OPPORTUNITY_COST_CONFIG.enabled && positivePlayers.length > 0 && slotsToFill > 0) {
      const avgSlotSpend = budget / Math.max(1, slotsToFill)
      let discountedSum = 0
      adjustedPositiveByName = new Map()
      for (const p of positivePlayers) {
        const linearRaw = linearRawByName.get(p.name) ?? 0
        const spendMultiple = avgSlotSpend > 0 ? (linearRaw / avgSlotSpend) : 1
        const excess = Math.max(0, spendMultiple - OPPORTUNITY_COST_CONFIG.premiumStartMultiple)
        const basePenalty = OPPORTUNITY_COST_CONFIG.curve === 'log'
          ? (1 / (1 + (OPPORTUNITY_COST_CONFIG.alpha * Math.log1p(excess))))
          : (1 / (1 + (OPPORTUNITY_COST_CONFIG.alpha * excess)))
        const penalty = Math.max(OPPORTUNITY_COST_CONFIG.minPenalty ?? 0, basePenalty)
        const discounted = linearRaw * penalty
        adjustedPositiveByName.set(p.name, discounted)
        discountedSum += discounted
      }
      // Intentionally do not renormalize up to budget.
      // Opportunity-cost adjustment is one-way: values can only decrease.
    }
    const out = new Map()
    for (const p of group) {
      const pv = rawVorp(p)
      const rawShare = pv > 0 ? (adjustedPositiveByName.get(p.name) ?? 0) : (pv * dollarsPerVorp)
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

  const adjBatters = allocGroup(unsoldBatters, hitBudget, batterNegPriority, batterSlotsToFill)
  const adjSP = allocGroup(unsoldSP, spBudget, spNegPriority, spSlotsToFill)
  const adjRP = allocGroup(unsoldRP, rpBudget, rpNegPriority, rpSlotsToFill)

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
  if (USE_CUSTOM_LEAGUE && SNAKE_DRAFT_ORDER.length > 0) {
    const teams = {}
    for (const row of SNAKE_DRAFT_ORDER) {
      const b = parseFloat(row.budget) || 300
      const s = parseInt(row.slots, 10) || 38
      const owner = (row.owner && String(row.owner).trim()) ? String(row.owner).trim() : ''
      teams[row.abbr] = {
        abbr: row.abbr,
        name: row.name,
        owner,
        gm: owner,
        budget_rem: b,
        slots_rem: s,
        budget_initial: b,
        slots_initial: s,
        budget_current: b,
        slots_current: s,
        slots_hit: row.slots_hit,
        slots_pit: row.slots_pit,
      }
    }
    return teams
  }
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

// ── SNAKE DRAFT + STARTER ROSTER RULES ─────────────────────────────────────
function computeStarterSlotTargets() {
  const cfg = LDB_DATA.meta?.replacement_levels?.config
  if (!cfg?.bat_slots_per_team) return { bat: 13, sp: 6, rp: 3 }
  const bat = Object.values(cfg.bat_slots_per_team).reduce((a, b) => a + b, 0)
  return {
    bat,
    sp: cfg.sp_slots_per_team ?? 8,
    rp: cfg.rp_slots_per_team ?? 5,
  }
}

/** League starter caps per team (hitters + SP + RP) — bench picks only after all three are filled. */
export const STARTER_SLOT_TARGETS = computeStarterSlotTargets()

export function getSnakePickerTeam(pickIndex, teamOrder) {
  return getNthLivePick(pickIndex, teamOrder, getKeeperRoundsByAbbr()).team
}

export function getSnakeDraftMeta(pickIndex, teamOrder) {
  const n = teamOrder.length
  if (!n) return { round: 1, pickInRound: 1, onClock: '', pickIndex: 0, livePicksThisRound: n }
  const e = getNthLivePick(pickIndex, teamOrder, getKeeperRoundsByAbbr())
  return {
    round: e.round,
    pickInRound: e.pickInRoundLive,
    onClock: e.team,
    pickIndex,
    livePicksThisRound: e.livePicksThisRound,
  }
}

export function countTeamPicksByType(sold, team) {
  let bat = 0
  let sp = 0
  let rp = 0
  for (const v of Object.values(sold)) {
    if (v.team !== team) continue
    if (v.pos_type === 'batter') bat += 1
    else if (v.pos_type === 'sp') sp += 1
    else if (v.pos_type === 'rp') rp += 1
  }
  return { bat, sp, rp }
}

/** Draft bucket (batter | sp | rp). Off-pool manual entries set `draft_pos_type`; pool players use gs / pa. */
export function resolveDraftPosType(player) {
  if (!player) return 'rp'
  const t = player.draft_pos_type
  if (t === 'batter' || t === 'sp' || t === 'rp') return t
  if (player.gs !== undefined) return 'sp'
  if (player.pa !== undefined) return 'batter'
  return 'rp'
}

/**
 * Until the starter lineup is full (13 hitters + SP + RP caps from league config), every pick must go
 * toward an unfilled starter bucket — no bench bats or bench arms. Order is free (mix hitters & pitchers),
 * but you cannot add hitter #14 until all 9 pitcher starters are filled, and you cannot add bench pitchers
 * until 13 hitters are filled.
 *
 * For hitters, optional `ctx` enforces active lineup slots: primary positions → MI/CI → DH (any hitter; DH-only never uses 1B).
 */
export function canDraftPlayerForTeam(sold, team, player, targets = STARTER_SLOT_TARGETS, ctx = null) {
  const posType = resolveDraftPosType(player)
  const { bat, sp, rp } = countTeamPicksByType(sold, team)
  const startersDone = bat >= targets.bat && sp >= targets.sp && rp >= targets.rp
  if (startersDone) return { ok: true }

  const needBat = Math.max(0, targets.bat - bat)
  const needSp = Math.max(0, targets.sp - sp)
  const needRp = Math.max(0, targets.rp - rp)

  // 13 hitters already → only pitchers until SP/RP starters are full (no bench bats)
  if (posType === 'batter' && bat >= targets.bat) {
    return {
      ok: false,
      message: `Starter lineup: add ${needSp} SP and ${needRp} RP before bench hitters.`,
    }
  }

  // SP/RP starters full but still short on hitters → must take bats before bench pitchers
  if (posType === 'sp' && sp >= targets.sp && bat < targets.bat) {
    return {
      ok: false,
      message: `Starter lineup: add ${needBat} more hitter(s) before bench SP.`,
    }
  }
  if (posType === 'rp' && rp >= targets.rp && bat < targets.bat) {
    return {
      ok: false,
      message: `Starter lineup: add ${needBat} more hitter(s) before bench RP.`,
    }
  }

  if (posType === 'batter' && bat < targets.bat) {
    if (ctx?.auctionLog && ctx?.battersByName) {
      if (!canStarterHitterFitTeam(team, player, ctx.auctionLog, ctx.battersByName)) {
        return {
          ok: false,
          message:
            'No open active hitter slot for this player’s eligibility (primaries → MI/CI → DH flex; DH-only does not use 1B).',
        }
      }
    }
    return { ok: true }
  }
  if (posType === 'sp' && sp < targets.sp) return { ok: true }
  if (posType === 'rp' && rp < targets.rp) return { ok: true }
  return {
    ok: false,
    message: `Fill all ${targets.bat} hitter starters and ${targets.sp + targets.rp} pitcher starters before bench picks (${needBat} bat · ${needSp} SP · ${needRp} RP left).`,
  }
}


// ── PERSISTENCE ────────────────────────────────────────────────────────────
const LS_KEY = 'ldb_auction_2026'
/** Above this, backfill was O(n²) and could freeze the tab — treat as corrupt. */
const MAX_AUCTION_LOG_ENTRIES = 50000

function backfillNominatedBy(log, teamsList) {
  if (!Array.isArray(log) || !teamsList?.length) return
  const kr = getKeeperRoundsByAbbr()
  const seq = buildLivePickTeamSequence(log.length, teamsList, kr)
  for (let i = 0; i < log.length; i++) {
    if (!log[i].nominatedBy) log[i].nominatedBy = seq[i] ?? ''
  }
}

/** Newest-first log → chronological pickIndex 0…n-1 (fixes missing/string indices for UI + lookups). */
function normalizePickIndices(log) {
  if (!Array.isArray(log) || log.length === 0) return
  const n = log.length
  for (let i = 0; i < n; i++) {
    const entry = log[i]
    if (entry == null || typeof entry !== 'object') continue
    const inferred = n - 1 - i
    const raw = entry.pickIndex
    if (raw == null || !Number.isFinite(Number(raw))) {
      entry.pickIndex = inferred
    } else {
      entry.pickIndex = Number(raw)
    }
  }
}

function saveToStorage(sold, teams, auctionLog, targetAvoid) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      v: 1,
      savedAt: Date.now(),
      sold,
      teams,
      auctionLog,
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
    if (log.length > MAX_AUCTION_LOG_ENTRIES) {
      console.warn('LDB: auction log too long; clearing saved session')
      return null
    }
    backfillNominatedBy(log, SNAKE_ORDER_ACTIVE)
    normalizePickIndices(log)
    return {
      ...parsed,
      auctionLog: log,
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
function buildStateFromSnapshot(snapshot, riskAdj = false) {
  const { sold, teams, auctionLog } = snapshot
  const recalced = recalcAllValues(LDB_DATA.batters, LDB_DATA.sp, LDB_DATA.rp, teams, sold, riskAdj)
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
  auctionLog: _init?.auctionLog ?? [],   // snake draft log (newest first); price = instructive pool value

  // Manual player notes (persisted to player_notes.json via API)
  manualNotes: {},

  // Target/avoid flags (persisted)
  targetAvoid: _saved?.targetAvoid ?? {},

  // UI state
  rankingsTab: 'batters',
  projSystem: 'batx',   // 'batx' | 'oopsy' | 'both'
  fryLens: false,
  riskAdj: false,
  searchQuery: '',
  tierFilter: new Set([1, 2, 3, 4, 5]),
  
  // Draft selection (snake: on-clock team derived from pick index)
  nominatedPlayer: null,
  bidTeam: getSnakePickerTeam((_init?.auctionLog ?? []).length, SNAKE_ORDER_ACTIVE),

  /** Bumps on confirm / undo / reset / import — subscribe for reliable React re-renders after picks. */
  draftRevision: 0,

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
  toggleRiskAdj: () => {
    const next = !get().riskAdj
    const recalc = recalcAllValues(get().batters, get().sp, get().rp, get().teams, get().sold, next)
    set({ riskAdj: next, batters: recalc.batters, sp: recalc.sp, rp: recalc.rp })
  },
  setSearch: q => set({ searchQuery: q }),
  toggleTier: tier => set(s => {
    const next = new Set(s.tierFilter)
    next.has(tier) ? next.delete(tier) : next.add(tier)
    return { tierFilter: next }
  }),
  setNominatedPlayer: player => {
    const nominationFloor = 0.5
    const pickIndex = get().auctionLog?.length ?? 0
    const onClock = getSnakePickerTeam(pickIndex, SNAKE_ORDER_ACTIVE)
    const nominated = player
      ? { ...player, adj_value: Math.max(nominationFloor, player.adj_value ?? player.est_value ?? nominationFloor) }
      : null
    return set({
      nominatedPlayer: nominated,
      bidTeam: onClock,
    })
  },

  toggleTargetAvoid: (playerName, flag) => {
    const { targetAvoid } = get()
    const next = { ...targetAvoid }
    if (flag === null) delete next[playerName]
    else next[playerName] = flag
    set({ targetAvoid: next })
    saveToStorage(get().sold, get().teams, get().auctionLog, next)
  },
  getTargetAvoid: (playerName) => get().targetAvoid[playerName] ?? null,
  getMaxBidForTeam: (team) => reserveAwareMaxBid(get().teams[team]),

  /** Snake draft: records instructive pool price (adj value), on-clock team from pick order. */
  confirmSale: (opts) => {
    const force = opts?.force === true
    const { nominatedPlayer, sold, auctionLog, teams, targetAvoid } = get()
    if (!nominatedPlayer) return
    const pickIndex = auctionLog.length
    const onClock = getSnakePickerTeam(pickIndex, SNAKE_ORDER_ACTIVE)
    const battersByName = new Map(get().batters.map((b) => [b.name, b]))
    const draftCheck = canDraftPlayerForTeam(sold, onClock, nominatedPlayer, STARTER_SLOT_TARGETS, {
      auctionLog,
      battersByName,
    })
    if (!force && !draftCheck.ok) return

    const roundHalf = v => Math.round(v * 2) / 2
    const price = Math.max(0.5, roundHalf(parseFloat(nominatedPlayer.adj_value ?? nominatedPlayer.est_value ?? 0.5)))

    const posType = resolveDraftPosType(nominatedPlayer)

    const newSold = {
      ...sold,
      [nominatedPlayer.name]: { price, team: onClock, pos_type: posType, ts: Date.now() },
    }
    const newTeams = { ...teams }
    if (newTeams[onClock]) {
      newTeams[onClock] = {
        ...newTeams[onClock],
        budget_current: Math.max(0, newTeams[onClock].budget_current - price),
        slots_current: Math.max(0, newTeams[onClock].slots_current - 1),
      }
    }
    const newLog = [
      {
        playerName: nominatedPlayer.name,
        team_mlb: nominatedPlayer.team,
        price,
        team: onClock,
        nominatedBy: onClock,
        pickIndex,
        pos_type: posType,
        est_value: nominatedPlayer.est_value,
        oopsy_est_value: nominatedPlayer.oopsy_est_value,
        rank: nominatedPlayer.rank,
        ts: Date.now(),
        ...(force && !draftCheck.ok ? { forced_override: true } : {}),
        ...(nominatedPlayer.manualPoolEntry ? { manual_pool_entry: true } : {}),
      },
      ...auctionLog,
    ]

    const recalc = recalcAllValues(get().batters, get().sp, get().rp, newTeams, newSold, get().riskAdj)
    const newBatters = recalc.batters
    const newSP      = recalc.sp
    const newRP      = recalc.rp

    saveToStorage(newSold, newTeams, newLog, targetAvoid)
    set({
      sold: newSold,
      teams: newTeams,
      auctionLog: newLog,
      batters: newBatters,
      sp: newSP,
      rp: newRP,
      nominatedPlayer: null,
      bidTeam: getSnakePickerTeam(pickIndex + 1, SNAKE_ORDER_ACTIVE),
      draftRevision: get().draftRevision + 1,
    })
  },

  undoLastSale: () => {
    const { auctionLog, sold, teams, targetAvoid } = get()
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
    const recalc = recalcAllValues(get().batters, get().sp, get().rp, newTeams, newSold, get().riskAdj)
    const newBatters = recalc.batters
    const newSP      = recalc.sp
    const newRP      = recalc.rp
    saveToStorage(newSold, newTeams, newLog, targetAvoid)
    set({
      sold: newSold,
      teams: newTeams,
      auctionLog: newLog,
      batters: newBatters,
      sp: newSP,
      rp: newRP,
      bidTeam: getSnakePickerTeam(newLog.length, SNAKE_ORDER_ACTIVE),
      draftRevision: get().draftRevision + 1,
    })
  },

  resetAuction: () => {
    const t = buildInitialTeams()
    const recalc = recalcAllValues(LDB_DATA.batters, LDB_DATA.sp, LDB_DATA.rp, t, {}, false)
    clearStorage()
    set({
      teams: t,
      sold: {},
      auctionLog: [],
      batters: recalc.batters,
      sp:      recalc.sp,
      rp:      recalc.rp,
      nominatedPlayer: null,
      bidTeam: getSnakePickerTeam(0, SNAKE_ORDER_ACTIVE),
      draftRevision: get().draftRevision + 1,
    })
  },

  // Load a snapshot from an imported file and rebuild state
  restoreFromSnapshot: (snapshot) => {
    const log = snapshot.auctionLog || []
    if (log.length > MAX_AUCTION_LOG_ENTRIES) {
      console.warn('LDB: import auction log too long; refusing restore')
      return
    }
    backfillNominatedBy(log, SNAKE_ORDER_ACTIVE)
    normalizePickIndices(log)
    const state = buildStateFromSnapshot({ ...snapshot, auctionLog: log }, get().riskAdj)
    const ta = snapshot.targetAvoid || {}
    saveToStorage(state.sold, state.teams, state.auctionLog, ta)
    set({
      ...state,
      nominatedPlayer: null,
      bidTeam: getSnakePickerTeam(state.auctionLog.length, SNAKE_ORDER_ACTIVE),
      targetAvoid: ta,
      draftRevision: get().draftRevision + 1,
    })
  },

  // Derived helpers
  getFryData: () => {
    const { teams, sold } = get()
    const lens = teams[MY_TEAM_ABBR] || teams.FRY || {}
    const fryWins = Object.entries(sold).filter(([, v]) => v.team === MY_TEAM_ABBR)
    return {
      budget_current: lens.budget_current ?? 0,
      slots_current: lens.slots_current ?? 0,
      wins: fryWins,
      spend: fryWins.reduce((s, [, v]) => s + v.price, 0),
    }
  },
}))

export const META = LDB_DATA.meta
/** All league team codes (sorted) — boards, filters, colors. Snake uses `SNAKE_PICK_ORDER`. */
export const TEAMS_LIST = ALL_TEAMS_SORTED

/** Teams that participate in the snake (order = round-1 sequence). */
export const SNAKE_PICK_ORDER = SNAKE_ORDER_ACTIVE
export const TEAM_COLORS = {
  ...TEAM_COLORS_BY_ABBR,
  FRY: '#c8f135', ICHI: '#38bdf8', POLL: '#fb923c', TONES: '#a78bfa',
  WORK: '#4ade80', WIND: '#67e8f9', ROOF: '#fbbf24', AIDS: '#f472b6',
  IPA: '#818cf8', PWRS: '#34d399', IZZY: '#f87171', NATE: '#94a3b8',
  CHOICE: '#e879f9', BALK: '#2dd4bf', NEO: '#fcd34d', CORN: '#86efac',
}

export { MY_TEAM_ABBR }

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
