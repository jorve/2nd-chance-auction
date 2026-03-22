/**
 * Stable function references for useAuctionStore(selector).
 * Inline `s => s.foo` creates a new function each render and can break React 18
 * useSyncExternalStore snapshot caching with Zustand v5.
 */

export const selectBatters = (s) => s.batters
export const selectSp = (s) => s.sp
export const selectRp = (s) => s.rp
export const selectSold = (s) => s.sold
export const selectAuctionLog = (s) => s.auctionLog
export const selectTeams = (s) => s.teams
export const selectRankingsTab = (s) => s.rankingsTab
export const selectSetRankingsTab = (s) => s.setRankingsTab
export const selectProjSystem = (s) => s.projSystem
export const selectSetProjSystem = (s) => s.setProjSystem
export const selectFryLens = (s) => s.fryLens
export const selectSearchQuery = (s) => s.searchQuery
export const selectSetSearch = (s) => s.setSearch
export const selectTierFilter = (s) => s.tierFilter
export const selectToggleTier = (s) => s.toggleTier
export const selectSetNominatedPlayer = (s) => s.setNominatedPlayer
export const selectToggleTargetAvoid = (s) => s.toggleTargetAvoid
export const selectGetTargetAvoid = (s) => s.getTargetAvoid
export const selectNominatedPlayer = (s) => s.nominatedPlayer
export const selectConfirmSale = (s) => s.confirmSale
export const selectResetAuction = (s) => s.resetAuction
export const selectGetNoteForPlayer = (s) => s.getNoteForPlayer
export const selectFryLensToggle = (s) => s.toggleFryLens
export const selectRiskAdj = (s) => s.riskAdj
export const selectToggleRiskAdj = (s) => s.toggleRiskAdj
export const selectUndoLastSale = (s) => s.undoLastSale
export const selectRestoreFromSnapshot = (s) => s.restoreFromSnapshot
export const selectDraftRevision = (s) => s.draftRevision
