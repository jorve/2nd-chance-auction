import keeperDraftRounds from '../data/keeper_draft_rounds.json'

/**
 * Raw `by_team` from keeper_draft_rounds.json (numbers and/or { player, round }).
 */
export function getKeeperRoundsByAbbr() {
  const bt = keeperDraftRounds?.by_team
  if (!bt || typeof bt !== 'object') return {}
  return bt
}

/** One normalized keeper row for display / tooling. */
export function normalizeKeeperEntry(item) {
  if (typeof item === 'number') {
    const r = Number(item)
    if (!Number.isFinite(r) || r < 1) return null
    return { player: null, round: r }
  }
  if (item && typeof item === 'object') {
    const r = Number(item.round ?? item.r)
    if (!Number.isFinite(r) || r < 1) return null
    const player = item.player ?? item.name ?? null
    return { player: player ? String(player).trim() : null, round: r }
  }
  return null
}

/** Per team: [{ player, round }, …] — includes round-only entries with player null. */
export function getKeeperRecordsByAbbr() {
  const bt = keeperDraftRounds?.by_team
  if (!bt || typeof bt !== 'object') return {}
  const out = {}
  for (const [abbr, raw] of Object.entries(bt)) {
    if (!Array.isArray(raw)) continue
    const rows = raw.map(normalizeKeeperEntry).filter(Boolean)
    if (rows.length) out[abbr] = rows
  }
  return out
}

/** Round numbers only (for snake skipping) — same length as keeper count per team. */
export function getKeeperRoundListForTeam(team, keeperRoundsByTeam) {
  const raw = keeperRoundsByTeam[team]
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeKeeperEntry).filter(Boolean).map((e) => e.round)
}

function keeperRoundSetForTeam(team, keeperRoundsByTeam) {
  return new Set(getKeeperRoundListForTeam(team, keeperRoundsByTeam))
}

/**
 * On-clock franchise for each live snake pick index 0 … pickCount-1 (same order as getNthLivePick).
 * One pass — safe to call with large pickCount (e.g. backfilling auctionLog).
 */
export function buildLivePickTeamSequence(pickCount, teamOrder, keeperRoundsByTeam = {}) {
  const n = teamOrder.length
  if (!n || pickCount <= 0) return []
  const seq = []
  for (let R = 1; R < 2500 && seq.length < pickCount; R++) {
    for (let slot = 0; slot < n; slot++) {
      const team = R % 2 === 1 ? teamOrder[slot] : teamOrder[n - 1 - slot]
      const kset = keeperRoundSetForTeam(team, keeperRoundsByTeam)
      if (kset.has(R)) continue
      seq.push(team)
      if (seq.length >= pickCount) break
    }
  }
  return seq
}

/** Keeper player name for this team+round, if recorded in JSON. */
export function findKeeperPlayerForRound(team, roundR, keeperRoundsByTeam) {
  const raw = keeperRoundsByTeam[team]
  if (!Array.isArray(raw)) return null
  for (const item of raw) {
    const e = normalizeKeeperEntry(item)
    if (e && e.round === roundR) return e.player
  }
  return null
}

/**
 * One row per snake slot in this round (odd: 0→n-1, even: reverse).
 * hasPick false = that team's pick is consumed by a keeper from last year's round `roundR`.
 */
export function getRoundBoard(roundR, teamOrder, keeperRoundsByTeam) {
  const n = teamOrder.length
  const rows = []
  for (let slot = 0; slot < n; slot++) {
    const team = roundR % 2 === 1 ? teamOrder[slot] : teamOrder[n - 1 - slot]
    const kset = keeperRoundSetForTeam(team, keeperRoundsByTeam)
    const keeperConsumesRound = kset.has(roundR)
    const keeperPlayer = keeperConsumesRound
      ? findKeeperPlayerForRound(team, roundR, keeperRoundsByTeam)
      : null
    rows.push({
      slot,
      team,
      hasPick: !keeperConsumesRound,
      keeperPlayer,
    })
  }
  return rows
}

/**
 * Nth live pick in the snake (0-based pickIndex), skipping slots consumed by keepers.
 * Odd rounds: teamOrder[0]…[n-1]; even rounds: reverse.
 */
export function getNthLivePick(pickIndex, teamOrder, keeperRoundsByTeam = {}) {
  const n = teamOrder.length
  if (!n || pickIndex < 0) {
    return {
      round: 1,
      team: '',
      pickInRoundLive: 0,
      livePicksThisRound: 0,
      pickIndex,
    }
  }

  let idx = 0
  for (let R = 1; R < 2500; R++) {
    const picks = []
    for (let slot = 0; slot < n; slot++) {
      const team = R % 2 === 1 ? teamOrder[slot] : teamOrder[n - 1 - slot]
      const kset = keeperRoundSetForTeam(team, keeperRoundsByTeam)
      if (kset.has(R)) continue
      picks.push(team)
    }
    const livePicksThisRound = picks.length
    for (let i = 0; i < picks.length; i++) {
      if (idx === pickIndex) {
        return {
          round: R,
          team: picks[i],
          pickInRoundLive: i + 1,
          livePicksThisRound,
          pickIndex,
        }
      }
      idx++
    }
  }

  return {
    round: 1,
    team: '',
    pickInRoundLive: 0,
    livePicksThisRound: 0,
    pickIndex,
  }
}
