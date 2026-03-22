/**
 * League scoring (Savages / 2nd-chance).
 *
 * Format: **season-long rotisserie** — category standings accumulate for the full year (not head-to-head weeks).
 *
 * **Lineups:** set weekly (not daily), so platoon / part-time players are less valuable — you cannot stream matchups day to day.
 *
 * **CBS roster (active):** 13 batters — C, 1B, 2B, 3B, SS, MI, CI, OF×5, U — plus 9 pitchers (app uses 6 SP + 3 RP). Max 38 rostered; 22 active minimum before bench/reserve/IL.
 */
/** Short label for header / tooltips */
export const LEAGUE_FORMAT_LINE = 'Season-long roto · not H2H'

/** Lineup frequency — affects platoon / bench bat value. */
export const LEAGUE_LINEUP_LINE = 'Weekly lineups (not daily) · platoons less valuable'
export const BATTING_CATEGORIES = [
  { code: 'BA', name: 'Batting Average' },
  { code: 'HR', name: 'Home Runs' },
  { code: 'R', name: 'Runs' },
  { code: 'RBI', name: 'Runs Batted In' },
  { code: 'SB', name: 'Stolen Bases' },
]

export const PITCHING_CATEGORIES = [
  { code: 'ERA', name: 'Earned Run Average' },
  { code: 'K', name: 'Strikeouts (Pitcher)' },
  { code: 'S', name: 'Saves' },
  { code: 'W', name: 'Wins' },
  { code: 'WHIP', name: 'Walks + Hits / Inning' },
]

/** One-line summary for tight UI. */
export const LEAGUE_SCORING_SHORT =
  'BA · HR · R · RBI · SB  —  ERA · K · S · W · WHIP'
