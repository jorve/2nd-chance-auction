import {
  faArrowUp,
  faBolt,
  faBullseye,
  faCircle,
  faDollarSign,
  faStar,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { FRY_NEEDS } from '../store/auctionStore.jsx'

export function getPlayerType(player) {
  if (!player) return null
  if (player.draft_pos_type === 'batter') return 'BAT'
  if (player.draft_pos_type === 'sp') return 'SP'
  if (player.draft_pos_type === 'rp') return 'RP'
  if (player.pa !== undefined) return 'BAT'
  if (player.gs !== undefined) return 'SP'
  return 'RP'
}

export function getFrySignal(player, fry, type) {
  const budget = fry?.budget_current ?? 0
  const val = player?.adj_value ?? 1
  const pct = budget > 0 ? val / budget : 0
  const posType = type || getPlayerType(player)

  if (budget <= 0) {
    return { label: 'PASS', color: 'var(--muted)', icon: faCircle, note: 'Budget exhausted' }
  }
  if (pct > 0.5) {
    return { label: 'RISKY', color: 'var(--red)', icon: faTriangleExclamation, note: `${Math.round(pct * 100)}% of remaining budget` }
  }
  if (pct > 0.35) {
    return { label: 'STRETCH', color: 'var(--orange)', icon: faArrowUp, note: `${Math.round(pct * 100)}% of remaining budget` }
  }
  if (FRY_NEEDS.critical.includes(posType) && (player?.tier ?? 99) <= 2) {
    return { label: 'MUST BID', color: 'var(--fry)', icon: faBullseye, note: `Critical need · T${player?.tier ?? '-'}` }
  }
  if (FRY_NEEDS.critical.includes(posType)) {
    return { label: 'FILL NEED', color: 'var(--green)', icon: faStar, note: `FRY needs ${posType}` }
  }

  const neededFill = (player?.positions ?? []).filter(pos => FRY_NEEDS.needed.includes(pos))
  if (neededFill.length > 0 && (player?.tier ?? 99) <= 2) {
    return { label: 'WANTED', color: 'var(--blue)', icon: faBullseye, note: `Fills ${neededFill.join('/')}` }
  }
  if ((player?.rfa_team ?? '') === 'FRY') {
    return { label: 'ROFR', color: 'var(--fry)', icon: faBolt, note: 'Right of first refusal' }
  }
  if ((player?.tier ?? 99) === 1) {
    return { label: 'ELITE', color: 'var(--t1)', icon: faBolt, note: 'Top tier target' }
  }
  if ((player?.tier ?? 99) === 2) {
    return { label: 'TARGET', color: 'var(--t2)', icon: faBullseye, note: 'Premium target' }
  }
  if (pct < 0.03) {
    return { label: 'ENDGAME', color: 'var(--text-dim)', icon: faDollarSign, note: '$1-3M range' }
  }
  return { label: 'WATCH', color: 'var(--text-faint)', icon: faCircle, note: 'Monitor only' }
}

export function getFryPriorityScore(player, fry, type) {
  const signal = getFrySignal(player, fry, type)
  const baseByLabel = {
    'MUST BID': 100,
    'FILL NEED': 85,
    WANTED: 80,
    ELITE: 75,
    TARGET: 70,
    ROFR: 68,
    ENDGAME: 58,
    WATCH: 50,
    STRETCH: 35,
    RISKY: 20,
    PASS: 0,
  }
  const tierBoost = Math.max(0, 6 - (player?.tier ?? 5))
  const valueBoost = Math.max(0, player?.adj_value ?? 0) * 0.25
  return (baseByLabel[signal.label] ?? 40) + tierBoost + valueBoost
}
