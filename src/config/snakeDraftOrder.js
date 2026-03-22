/**
 * Custom 11-team league. `name` = franchise (shown on the clock). `owner` = optional; fill in when you map people to teams.
 * `abbr` = stable internal id for saves/picks — do not rename once draft data exists.
 *
 * CBS roster: max 38 total; 22 active (13 hit + 9 P); reserve/IL 0–8 each. `slots` = max roster picks to track (post-keeper draft).
 */
export const USE_CUSTOM_LEAGUE = true

/** Your squad — header budget, needs lens, “MY” column (Bed Stuy Fish Fry). */
export const MY_TEAM_ABBR = 'BEDST'

/**
 * Round-1 snake order = array order.
 */
export const SNAKE_DRAFT_ORDER = [
  { abbr: 'SAVG2', name: '2025 Savages 2', owner: 'Neil', slots_hit: 13, slots_pit: 9, slots: 38, budget: 300 },
  { abbr: 'JAYHK', name: 'Jayhawks', owner: 'Jay W.', slots_hit: 13, slots_pit: 9, slots: 38, budget: 300 },
  { abbr: 'INGBT', name: 'Inglorious Batters', owner: 'Matt', slots_hit: 13, slots_pit: 9, slots: 38, budget: 300 },
  { abbr: 'HIGH2', name: 'Highlanders II', owner: 'Dennis', slots_hit: 13, slots_pit: 9, slots: 38, budget: 300 },
  { abbr: 'CL21B', name: '21 Club 2', owner: 'Martin', slots_hit: 13, slots_pit: 9, slots: 38, budget: 300 },
  { abbr: 'RUBYR', name: 'The Ruby Ring Gang A', owner: 'Norm', slots_hit: 13, slots_pit: 9, slots: 38, budget: 300 },
  { abbr: 'MENDL', name: 'Mendel Lapse', owner: 'Arnie M', slots_hit: 13, slots_pit: 9, slots: 38, budget: 300 },
  { abbr: 'BEDST', name: 'Bed Stuy Fish Fry', owner: 'Jeff J. (me)', slots_hit: 13, slots_pit: 9, slots: 38, budget: 300 },
  { abbr: 'CASEY', name: 'Casey HotDog', owner: 'Toby', slots_hit: 13, slots_pit: 9, slots: 38, budget: 300 },
  { abbr: 'CUCKOO', name: "Flew Over the Cuckoo's Nest", owner: 'John C.', slots_hit: 13, slots_pit: 9, slots: 38, budget: 300 },
  { abbr: 'BEHEM', name: 'Behemoth', owner: 'Jon L.', slots_hit: 13, slots_pit: 9, slots: 38, budget: 300 },
]

export const SNAKE_TEAM_ORDER = SNAKE_DRAFT_ORDER.map((r) => r.abbr)

const _rowByAbbr = Object.fromEntries(SNAKE_DRAFT_ORDER.map((r) => [r.abbr, r]))

/** Franchise name for a team id. */
export function getSnakeTeamName(teamAbbr) {
  return _rowByAbbr[teamAbbr]?.name ?? teamAbbr
}

/** Owner display name, or empty string if you have not set it yet. */
export function getSnakeOwner(teamAbbr) {
  const o = _rowByAbbr[teamAbbr]?.owner
  return (o && String(o).trim()) ? o.trim() : ''
}

/** @deprecated use getSnakeTeamName */
export function getSnakeGmLabel(teamAbbr) {
  return getSnakeTeamName(teamAbbr)
}

/** One line for toasts / compact confirm: "Team Name · Owner" or just team name. */
export function getSnakeClockLabel(teamAbbr) {
  const t = getSnakeTeamName(teamAbbr)
  const o = getSnakeOwner(teamAbbr)
  return o ? `${t} · ${o}` : t
}

export const TEAM_COLORS_BY_ABBR = {
  SAVG2: '#c8f135',
  JAYHK: '#38bdf8',
  INGBT: '#fb923c',
  HIGH2: '#a78bfa',
  CL21B: '#4ade80',
  RUBYR: '#67e8f9',
  MENDL: '#fbbf24',
  BEDST: '#f472b6',
  CASEY: '#818cf8',
  CUCKOO: '#34d399',
  BEHEM: '#94a3b8',
}
