/**
 * Active-hitter slotting (13 per team): primary positions first, then MI/CI buckets, then DH.
 * DH is a universal flex — any hitter may fill it.
 * DH-only (no other primary) profiles do not use the 1B slot — they fill other primaries / OF / MI / CI / DH (never 1B).
 */

const PRIMARY = ['C', '1B', '2B', '3B', 'SS']
const OF_TOKENS = new Set(['OF', 'LF', 'CF', 'RF'])

/** Try order including five OF slots */
export const HITTER_SLOT_TRY_ORDER = [
  'C', '1B', '2B', '3B', 'SS',
  'OF', 'OF', 'OF', 'OF', 'OF',
  'MI', 'CI', 'DH',
]

const MAX_FILL = {
  C: 1, '1B': 1, '2B': 1, '3B': 1, SS: 1, OF: 5, MI: 1, CI: 1, DH: 1,
}

export function createEmptyHitterSlotState() {
  return {
    C: 0, '1B': 0, '2B': 0, '3B': 0, SS: 0, OF: 0, MI: 0, CI: 0, DH: 0,
  }
}

function expandRawPositions(positions) {
  const s = new Set(positions || [])
  if (s.has('INF')) {
    s.add('1B')
    s.add('2B')
    s.add('3B')
    s.add('SS')
    s.add('MI')
    s.add('CI')
  }
  return s
}

/** True if CBS lists DH and no other primary hitting position */
export function isDHOnly(positions) {
  const s = expandRawPositions(positions)
  if (!s.has('DH')) return false
  for (const p of PRIMARY) if (s.has(p)) return false
  for (const o of OF_TOKENS) if (s.has(o)) return false
  if (s.has('MI') || s.has('CI') || s.has('U') || s.has('UT')) return false
  return true
}

function hasOF(s) {
  for (const o of OF_TOKENS) if (s.has(o)) return true
  return false
}

/**
 * Can this player fill this active slot given current counts (not mutating)?
 */
export function canFillHitterSlot(rawPositions, slot) {
  const s = expandRawPositions(rawPositions)
  // DH flex + legacy utility token: any hitter
  if (slot === 'DH' || slot === 'U') return true

  if (!s.size) return false

  if (isDHOnly(rawPositions)) {
    if (slot === '1B') return false
    if (PRIMARY.includes(slot) && slot !== '1B') return true
    if (slot === 'OF') return true
    if (slot === 'MI' || slot === 'CI') return true
    return false
  }

  switch (slot) {
    case 'C':
      return s.has('C')
    case '1B':
      return s.has('1B')
    case '2B':
      return s.has('2B')
    case '3B':
      return s.has('3B')
    case 'SS':
      return s.has('SS')
    case 'OF':
      return hasOF(s)
    case 'MI':
      return s.has('MI') || s.has('2B') || s.has('SS')
    case 'CI':
      return s.has('CI') || s.has('1B') || s.has('3B')
    default:
      return false
  }
}

function slotAvailable(state, slot) {
  const cap = MAX_FILL[slot] ?? 1
  const cur = state[slot] ?? 0
  return cur < cap
}

/**
 * Assign one hitter to the first open slot in try-order. Returns new state + slot, or null.
 */
export function assignHitterToSlot(rawPositions, state) {
  const tryOrder = isDHOnly(rawPositions)
    ? HITTER_SLOT_TRY_ORDER.filter((x) => x !== '1B')
    : HITTER_SLOT_TRY_ORDER

  const next = { ...state }
  for (const slot of tryOrder) {
    if (!slotAvailable(next, slot)) continue
    if (!canFillHitterSlot(rawPositions, slot)) continue
    next[slot] = (next[slot] ?? 0) + 1
    return { slot, state: next }
  }
  return null
}

/** Chronological batter picks for one fantasy team */
export function teamBatterPickNamesChronological(auctionLog, teamAbbr) {
  if (!auctionLog?.length) return []
  const out = []
  for (let i = auctionLog.length - 1; i >= 0; i--) {
    const e = auctionLog[i]
    if (e.team === teamAbbr && e.pos_type === 'batter') out.push(e.playerName)
  }
  return out
}

export function simulateHitterSlotsForTeam(teamAbbr, auctionLog, battersByName) {
  let state = createEmptyHitterSlotState()
  const names = teamBatterPickNamesChronological(auctionLog, teamAbbr)
  for (const name of names) {
    const p = battersByName.get(name)
    const pos = p?.positions ?? []
    const r = assignHitterToSlot(pos, state)
    if (r) state = r.state
  }
  return state
}

export function canStarterHitterFitTeam(teamAbbr, player, auctionLog, battersByName) {
  const state = simulateHitterSlotsForTeam(teamAbbr, auctionLog, battersByName)
  const pos = player?.positions ?? []
  return assignHitterToSlot(pos, state) != null
}

/** For position-filter chips: show posKey if some unsold batter matches AND could still fill a starter slot */
export function playerMatchesBattersPosFilter(player, posKey) {
  const pos = player?.positions ?? []
  if (posKey === 'CF' || posKey === 'RF') {
    return pos.includes(posKey) || pos.includes('OF') || pos.includes('LF')
  }
  return pos.includes(posKey)
}

export function isBattersPosFilterUseful(
  teamAbbr,
  posKey,
  auctionLog,
  battersByName,
  unsoldBatters,
) {
  const state = simulateHitterSlotsForTeam(teamAbbr, auctionLog, battersByName)
  return unsoldBatters.some((p) => {
    if (!playerMatchesBattersPosFilter(p, posKey)) return false
    return assignHitterToSlot(p.positions ?? [], { ...state }) != null
  })
}
