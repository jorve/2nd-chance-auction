import { useEffect, useRef, useState } from 'react'
import { FRY_NEEDS, TEAM_COLORS, useAuctionStore } from '../store/auctionStore.jsx'

// ── HELPERS ───────────────────────────────────────────────────────────────────
const TIER_COLORS = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)', 4: 'var(--t4)', 5: 'var(--t5)' }
const TIER_NAMES  = { 1: 'T1 · ELITE', 2: 'T2 · PREMIUM', 3: 'T3 · MID', 4: 'T4 · VALUE', 5: 'T5 · DEEP' }

function getType(p) {
  if (!p) return null
  if (p.pa  !== undefined) return 'BAT'
  if (p.gs  !== undefined) return 'SP'
  return 'RP'
}

function fmt(v, dec = 0) {
  if (v == null || v === '') return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return String(v)
  return dec ? n.toFixed(dec) : Math.round(n)
}

function fmtDollar(v) {
  if (v == null) return '—'
  return `$${v}M`
}

// ── TAG CONFIG (matches PlayerList) ──────────────────────────────────────────
const TAG_CONFIG = {
  ELITE:        { bg: 'rgba(200,241,53,.15)',  color: 'var(--t1)',      text: 'ELITE' },
  POWER_OBP:    { bg: 'rgba(200,241,53,.12)',  color: 'var(--t1)',      text: 'PWR+OBP' },
  HR_THREAT:    { bg: 'rgba(251,146,60,.12)',  color: 'var(--orange)',  text: 'HR THREAT' },
  SB_THREAT:    { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'SB THREAT' },
  OBP_ONLY:     { bg: 'rgba(56,189,248,.08)',  color: 'var(--blue)',    text: 'OBP ONLY' },
  WORKHORSE:    { bg: 'rgba(74,222,128,.12)',  color: 'var(--green)',   text: 'WORKHORSE' },
  K_MACHINE:    { bg: 'rgba(200,241,53,.12)',  color: 'var(--t1)',      text: 'K MACHINE' },
  RATIOS_ACE:   { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'RATIOS ACE' },
  GB_PITCHER:   { bg: 'rgba(74,222,128,.10)',  color: 'var(--green)',   text: 'GB PITCHER' },
  MGS_ELITE:    { bg: 'rgba(200,241,53,.12)',  color: 'var(--t1)',      text: 'MGS ELITE' },
  INNINGS_EAT:  { bg: 'rgba(74,222,128,.10)',  color: 'var(--green)',   text: 'INN EATER' },
  CLOSER:       { bg: 'rgba(251,146,60,.15)',  color: 'var(--orange)',  text: 'CLOSER' },
  HOLDS_VALUE:  { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'HOLDS VALUE' },
  SAVES_SAFE:   { bg: 'rgba(74,222,128,.12)',  color: 'var(--green)',   text: 'SAVES SAFE' },
  CLOSER_RISK:  { bg: 'rgba(248,113,113,.12)', color: 'var(--red)',     text: 'CLOSER RISK' },
  ELITE_ERA:    { bg: 'rgba(74,222,128,.12)',  color: 'var(--green)',   text: 'ELITE ERA' },
  VIJAY_ELITE:  { bg: 'rgba(200,241,53,.12)',  color: 'var(--t1)',      text: 'VIJAY ELITE' },
  SLEEPER:      { bg: 'rgba(167,139,250,.12)', color: 'var(--purple)',  text: 'SLEEPER' },
  BREAKOUT:     { bg: 'rgba(200,241,53,.15)',  color: 'var(--t1)',      text: 'BREAKOUT' },
  BOUNCE_BACK:  { bg: 'rgba(200,241,53,.10)',  color: 'var(--t1)',      text: 'BOUNCE BACK' },
  BUST:         { bg: 'rgba(248,113,113,.12)', color: 'var(--red)',     text: 'BUST' },
  INJURED:      { bg: 'rgba(248,113,113,.15)', color: 'var(--red)',     text: 'INJURED' },
  IL:           { bg: 'rgba(248,113,113,.15)', color: 'var(--red)',     text: 'IL' },
  IL_START:     { bg: 'rgba(248,113,113,.15)', color: 'var(--red)',     text: 'IL START' },
  DTD:          { bg: 'rgba(251,146,60,.15)',  color: 'var(--orange)',  text: 'DAY TO DAY' },
  DELAYED:      { bg: 'rgba(251,146,60,.10)',  color: 'var(--orange)',  text: 'DELAYED' },
  INJURY_RISK:  { bg: 'rgba(251,146,60,.12)',  color: 'var(--orange)',  text: 'INJ RISK' },
  ROLE_UNCLEAR: { bg: 'rgba(251,146,60,.10)',  color: 'var(--orange)',  text: 'ROLE UNCLEAR' },
  STASH:        { bg: 'rgba(167,139,250,.12)', color: 'var(--purple)',  text: 'STASH' },
  PROSPECT:     { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'PROSPECT' },
  DEEP_LEAGUE:  { bg: 'rgba(156,163,175,.10)', color: 'var(--muted)',   text: 'DEEP LEAGUE' },
  SP_LOCKED:    { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'ROLE LOCKED' },
  RP_SP_ELIG:   { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'RP + SP ELIG' },
}

function TagPill({ tag }) {
  const cfg = TAG_CONFIG[tag] || { bg: 'rgba(148,163,184,.10)', color: 'var(--muted)', text: tag }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      background: `linear-gradient(180deg, ${cfg.bg}, rgba(8,10,14,.7))`,
      color: cfg.color,
      border: `1px solid ${cfg.color}88`,
      borderRadius: 999,
      padding: '3px 9px',
      fontFamily: "'DM Sans', sans-serif",
      fontSize: 10,
      letterSpacing: 0.3,
      fontWeight: 700,
      lineHeight: 1.2,
      textTransform: 'uppercase',
    }}>
      {cfg.text}
    </span>
  )
}

// ── FRY SIGNAL ────────────────────────────────────────────────────────────────
function getFrySignal(player, fry, type) {
  const budget = fry.budget_current ?? 0
  const val    = player.adj_value ?? 1
  const pct    = budget > 0 ? val / budget : 0

  if (budget <= 0)    return { label: 'BUDGET EXHAUSTED', color: 'var(--muted)',      icon: '—' }
  if (pct > 0.5)      return { label: 'RISKY — OVER 50% OF BUDGET',  color: 'var(--red)',    icon: '⚠' }
  if (pct > 0.35)     return { label: 'STRETCH — OVER 35% OF BUDGET', color: 'var(--orange)', icon: '↑' }

  if (FRY_NEEDS.critical.includes(type) && player.tier <= 2)
    return { label: 'MUST BID — CRITICAL NEED',  color: 'var(--fry)',   icon: '🎯' }
  if (FRY_NEEDS.critical.includes(type))
    return { label: 'FILLS CRITICAL NEED',        color: 'var(--green)', icon: '★'  }

  const neededFill = (player.positions ?? []).filter(pos => FRY_NEEDS.needed.includes(pos))
  if (neededFill.length > 0 && player.tier <= 2)
    return { label: `FILLS ${neededFill.join('/')} NEED`, color: 'var(--blue)', icon: '◎' }
  if (neededFill.length > 0)
    return { label: `POSITIONAL FILL — ${neededFill.join('/')}`, color: 'var(--blue)', icon: '◎' }

  if (player.rfa_team === 'FRY')
    return { label: 'FRY HOLDS ROFR', color: 'var(--fry)', icon: '⚡' }

  if (player.tier === 1) return { label: 'ELITE — BID AGGRESSIVELY', color: 'var(--t1)',   icon: '⚡' }
  if (player.tier === 2) return { label: 'PREMIUM TARGET',            color: 'var(--t2)',   icon: '◎' }
  if (pct < 0.03)        return { label: 'ENDGAME VALUE',             color: 'var(--muted)', icon: '$' }
  return                        { label: 'MONITOR',                   color: 'var(--text-faint)', icon: '·' }
}

// ── STAT ROW ─────────────────────────────────────────────────────────────────
function StatRow({ label, primary, oopsy, dec = 0, inv = false }) {
  const p = primary != null ? parseFloat(primary) : null
  const o = oopsy   != null ? parseFloat(oopsy)   : null
  const hasBoth = p != null && o != null

  // Delta color: positive delta for normal stats is green, for inv stats (ERA/WHIP) is reversed
  let deltaColor = 'var(--text-faint)'
  if (hasBoth) {
    const delta = o - p
    const better = inv ? delta < 0 : delta > 0
    deltaColor = Math.abs(delta) < 0.01 ? 'var(--text-faint)' : better ? '#4ade80' : '#f87171'
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '90px 1fr 1fr',
      gap: 8, alignItems: 'center',
      padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.04)',
    }}>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)', letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text)', textAlign: 'right' }}>
        {p != null ? fmt(p, dec) : '—'}
      </span>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: deltaColor, textAlign: 'right' }}>
        {o != null ? fmt(o, dec) : '—'}
      </span>
    </div>
  )
}

// ── ATHLETIC METRIC ───────────────────────────────────────────────────────────
function AthlMetric({ label, value, suffix = '', colorFn }) {
  if (value == null) return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)', marginBottom: 3, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: 'var(--muted)' }}>—</div>
    </div>
  )
  const color = colorFn ? colorFn(parseFloat(value)) : 'var(--text)'
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)', marginBottom: 3, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color, letterSpacing: 1 }}>
        {typeof value === 'number' ? value : parseFloat(value).toFixed(value % 1 !== 0 ? 2 : 0)}{suffix}
      </div>
    </div>
  )
}

const plusColor  = n => n >= 115 ? '#4ade80' : n >= 105 ? '#86efac' : n >= 95 ? 'var(--text-dim)' : n >= 85 ? '#fca5a5' : '#f87171'
const eraColor   = n => n <= 3.0 ? '#4ade80' : n <= 3.5 ? '#86efac' : n <= 4.0 ? 'var(--text-dim)' : n <= 4.5 ? '#fca5a5' : '#f87171'
const healthColor = n => n >= 90 ? '#4ade80' : n >= 80 ? '#86efac' : n >= 70 ? 'var(--orange)' : '#f87171'

// ── RANK CHIP ─────────────────────────────────────────────────────────────────
function RankChip({ label, rank, color = 'var(--text-dim)', dim = false }) {
  if (rank == null) return null
  return (
    <div style={{
      background: dim ? 'rgba(255,255,255,.03)' : `${color}12`,
      border: `1px solid ${dim ? 'var(--border)' : color + '44'}`,
      borderRadius: 5, padding: '6px 12px', textAlign: 'center',
    }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: dim ? 'var(--text-faint)' : color, letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: dim ? 'var(--text-dim)' : color, letterSpacing: 1 }}>#{rank}</div>
    </div>
  )
}

// ── VALUE CHIP ────────────────────────────────────────────────────────────────
function ValueChip({ label, value, color = 'var(--text)', sub }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)',
      borderRadius: 5, padding: '8px 12px', textAlign: 'center', flex: 1,
    }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)', letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color, letterSpacing: 1, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── SECTION LABEL ─────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: 2,
      color: 'var(--text-faint)', textTransform: 'uppercase',
      marginBottom: 8, marginTop: 18,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      {children}
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function PlayerCard({ player, onClose, teams, onNominate }) {
  if (!player) return null
  const type   = getType(player)
  const tColor = TIER_COLORS[player.tier] || 'var(--muted)'
  const fry    = teams['FRY'] || {}

  const manualNote   = useAuctionStore(s => s.getNoteForPlayer(player.name))
  const hasManual     = useAuctionStore(s => s.hasManualNote(player.name))
  const setManualNote = useAuctionStore(s => s.setManualNote)
  const deleteManual  = useAuctionStore(s => s.deleteManualNote)
  const targetAvoid   = useAuctionStore(s => s.getTargetAvoid(player.name))
  const toggleTargetAvoid = useAuctionStore(s => s.toggleTargetAvoid)

  const effectiveNote = manualNote ?? player.note ?? ''
  const [noteDraft, setNoteDraft] = useState(effectiveNote)
  const [noteSaving, setNoteSaving] = useState(false)

  useEffect(() => { setNoteDraft(effectiveNote) }, [effectiveNote, player.name])

  async function handleSaveNote() {
    setNoteSaving(true)
    const ok = await setManualNote(player.name, noteDraft.trim())
    setNoteSaving(false)
  }

  async function handleDeleteNote() {
    setNoteSaving(true)
    const ok = await deleteManual(player.name)
    if (ok) setNoteDraft(player.note ?? '')
    setNoteSaving(false)
  }

  const isSP  = type === 'SP'
  const isRP  = type === 'RP'
  const isBAT = type === 'BAT'

  const frySignal = getFrySignal(player, fry, type)
  const hasAthletic = isSP && player.athl_rank != null

  const modalRef = useRef(null)

  // ESC to close
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  // Focus trap + initial focus
  useEffect(() => {
    const el = modalRef.current
    if (!el) return
    const focusables = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (first) first.focus()
    function trap(e) {
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
  }, [])

  // Score delta display
  const scoreDelta = player.oopsy_ldb_score != null
    ? (player.ldb_score - player.oopsy_ldb_score).toFixed(2)
    : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-card-title"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        overflowY: 'auto', padding: '32px 16px 64px',
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: 'var(--surface)', border: `1px solid ${tColor}44`,
          borderRadius: 12, width: '100%', maxWidth: 620,
          boxShadow: `0 24px 80px rgba(0,0,0,.7), 0 0 0 1px ${tColor}22`,
          position: 'relative',
        }}
      >

        {/* ── HEADER ── */}
        <div style={{
          padding: '18px 20px 14px',
          background: `linear-gradient(135deg, ${tColor}0d 0%, transparent 60%)`,
          borderBottom: '1px solid var(--border)',
          borderRadius: '12px 12px 0 0',
        }}>
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 14, right: 14,
              background: 'var(--surface2)', border: '1px solid var(--border2)',
              borderRadius: 5, width: 28, height: 28, cursor: 'pointer',
              color: 'var(--text-dim)', fontSize: 14, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>

          {/* Name + team + hand */}
          <div style={{ marginRight: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span id="player-card-title" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: 'var(--text)', letterSpacing: 2, lineHeight: 1 }}>
                {player.name}{player.positions?.length ? ` | ${player.positions.join(' · ')}` : ''}
              </span>
              {player.handedness && (
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1 }}>
                  {player.handedness}
                </span>
              )}
            </div>
            {player.tags?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {player.tags.map(tag => <TagPill key={tag} tag={tag} />)}
              </div>
            )}

            {/* Badge row */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
              {/* Team */}
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text)', fontWeight: 600, letterSpacing: 1 }}>
                {player.team || 'FA'}
              </span>

              {/* Type badge */}
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1,
                padding: '2px 7px', borderRadius: 3,
                background: isBAT ? 'rgba(200,241,53,.12)' : isSP ? 'rgba(56,189,248,.12)' : 'rgba(251,146,60,.12)',
                color: isBAT ? 'var(--t1)' : isSP ? 'var(--blue)' : 'var(--orange)',
              }}>{type}</span>

              {/* Tier badge */}
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1,
                color: tColor, border: `1px solid ${tColor}55`, padding: '2px 7px', borderRadius: 3,
              }}>{TIER_NAMES[player.tier] || `T${player.tier}`}</span>

              {/* ROFR */}
              {player.rfa_team && (
                <span style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 9,
                  color: player.rfa_team === 'FRY' ? 'var(--fry)' : 'var(--orange)',
                  border: '1px solid currentColor', padding: '2px 6px', borderRadius: 3,
                }}>
                  ROFR: {player.rfa_team}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{ padding: '0 20px 20px' }}>

          {/* ── VALUATION ── */}
          <SectionLabel>Valuation</SectionLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <ValueChip
              label="ADJ VALUE"
              value={fmtDollar(player.adj_value)}
              color={tColor}
              sub={player.adj_value !== player.est_value
                ? `${player.adj_value - player.est_value > 0 ? '+' : ''}${Math.round(player.adj_value - player.est_value)} from base`
                : null}
            />
            <ValueChip
              label={isBAT ? 'BATX BASE' : 'ATC BASE'}
              value={fmtDollar(player.est_value)}
              color="var(--text-dim)"
            />
            {player.oopsy_est_value != null && (
              <ValueChip
                label="OOPSY"
                value={fmtDollar(player.oopsy_est_value)}
                color="var(--purple)"
              />
            )}
            <ValueChip
              label="LDB SCORE"
              value={player.ldb_score?.toFixed(1) ?? '—'}
              color="var(--text-dim)"
              sub={scoreDelta != null ? `vs OOPSY: ${scoreDelta > 0 ? '+' : ''}${scoreDelta}` : null}
            />
          </div>

          {/* ── RANKINGS ── */}
          {(player.pl_rank != null || player.oopsy_rank != null || player.athl_rank != null) && (
            <>
              <SectionLabel>Rankings</SectionLabel>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <RankChip label="LDB" rank={player.rank} color={tColor} />
                {player.pl_rank != null && (
                  <RankChip label="PL" rank={player.pl_rank} color="var(--purple)" />
                )}
                {player.oopsy_rank != null && (
                  <RankChip label="OOPSY" rank={player.oopsy_rank} color="var(--blue)" dim />
                )}
                {player.athl_rank != null && (
                  <RankChip label="ATHLETIC" rank={player.athl_rank} color="var(--orange)" />
                )}
              </div>
              {player.pl_tier_name && (
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--purple)', marginTop: 6, letterSpacing: 0.5 }}>
                  PL Tier: {player.pl_tier_name}
                </div>
              )}
            </>
          )}

          {/* ── PROJECTIONS ── */}
          <SectionLabel>Projections</SectionLabel>

          {/* Column headers */}
          <div style={{
            display: 'grid', gridTemplateColumns: '90px 1fr 1fr',
            gap: 8, paddingBottom: 6, marginBottom: 2,
            borderBottom: '1px solid var(--border2)',
          }}>
            <span />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-dim)', textAlign: 'right', letterSpacing: 1 }}>
              {isBAT ? 'BATX' : 'ATC'}
            </span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--purple)', textAlign: 'right', letterSpacing: 1 }}>
              OOPSY
            </span>
          </div>

          {/* Batter stats */}
          {isBAT && (<>
            <StatRow label="G"    primary={player.g}        oopsy={player.oopsy_g} />
            <StatRow label="PA"   primary={player.pa}       oopsy={player.oopsy_pa} />
            <StatRow label="HR"   primary={player.hr}       oopsy={player.oopsy_hr}  dec={1} />
            <StatRow label="R"    primary={player.r}        oopsy={player.oopsy_r}   dec={1} />
            <StatRow label="OBP"  primary={player.obp}      oopsy={player.oopsy_obp} dec={3} />
            <StatRow label="OPS"  primary={player.ops}      oopsy={player.oopsy_ops} dec={3} />
            <StatRow label="aSB"  primary={player.asb}      oopsy={player.oopsy_asb} dec={1} />
            <StatRow label="aRBI" primary={player.rbi}      oopsy={player.oopsy_rbi} dec={1} />
            <StatRow label="wRC+" primary={player.wrc_plus} oopsy={player.oopsy_wrc_plus} dec={1} />
            <StatRow label="WAR"  primary={player.war}      oopsy={player.oopsy_war} dec={2} />
          </>)}

          {/* SP stats */}
          {isSP && (<>
            <StatRow label="GS"      primary={player.gs}   oopsy={player.oopsy_gs}   dec={1} />
            <StatRow label="IP"      primary={player.ip}   oopsy={player.oopsy_ip}   dec={1} />
            <StatRow label="K"       primary={player.k}    oopsy={player.oopsy_k}    dec={1} />
            <StatRow label="ERA"     primary={player.era}  oopsy={player.oopsy_era}  dec={3} inv />
            <StatRow label="WHIP"    primary={player.whip} oopsy={player.oopsy_whip} dec={3} inv />
            <StatRow label="HRA"     primary={player.hra}  oopsy={player.oopsy_hra}  dec={1} inv />
            <StatRow label="MGS/GS"  primary={player.mgs}  oopsy={player.oopsy_mgs}  dec={2} />
            <StatRow label="FIP"     primary={player.fip}  oopsy={player.oopsy_fip}  dec={3} inv />
            <StatRow label="WAR"     primary={player.war}  oopsy={player.oopsy_war}  dec={2} />
          </>)}

          {/* RP stats */}
          {isRP && (<>
            <StatRow label="G"        primary={player.g}     oopsy={player.oopsy_g}     dec={1} />
            <StatRow label="IP"       primary={player.ip}    oopsy={player.oopsy_ip}    dec={1} />
            <StatRow label="SV"       primary={player.sv}    oopsy={player.oopsy_sv}    dec={1} />
            <StatRow label="HLD"      primary={player.hld}   oopsy={player.oopsy_hld}   dec={1} />
            <StatRow label="BS"       primary={player.bs}    oopsy={player.oopsy_bs}    dec={1} inv />
            <StatRow label="K"        primary={player.k}     oopsy={player.oopsy_k}     dec={1} />
            <StatRow label="ERA"      primary={player.era}   oopsy={player.oopsy_era}   dec={3} inv />
            <StatRow label="WHIP"     primary={player.whip}  oopsy={player.oopsy_whip}  dec={3} inv />
            <StatRow label="VIJAY/G"  primary={player.vijay} oopsy={player.oopsy_vijay} dec={3} />
            <StatRow label="WAR"      primary={player.war}   oopsy={player.oopsy_war}   dec={2} />
          </>)}

          {/* ── ATHLETIC (SP only) ── */}
          {hasAthletic && (<>
            <SectionLabel>The Athletic Rankings</SectionLabel>
            <div style={{
              background: 'rgba(251,146,60,.04)', border: '1px solid rgba(251,146,60,.15)',
              borderRadius: 8, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-around', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <AthlMetric label="STUFF+"    value={player.stuff_plus}    colorFn={plusColor} />
                <AthlMetric label="LOCATION+" value={player.location_plus} colorFn={plusColor} />
                <AthlMetric label="PITCHING+" value={player.pitching_plus} colorFn={plusColor} />
                <AthlMetric label="H%"        value={player.athl_health}   suffix="%" colorFn={healthColor} />
                <AthlMetric label="ppERA"     value={player.pp_era}        colorFn={eraColor} />
                <AthlMetric label="ppK%"      value={player.pp_k_pct}      suffix="%" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid rgba(251,146,60,.12)' }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)', letterSpacing: 1 }}>
                  PROJ IP
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-dim)' }}>
                  {player.athl_ip ?? '—'}
                </span>
              </div>
            </div>
          </>)}

          {/* ── TARGET / AVOID ── */}
          <SectionLabel>Target / Avoid</SectionLabel>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <button
              onClick={() => toggleTargetAvoid(player.name, targetAvoid === 'target' ? null : 'target')}
              style={{
                background: targetAvoid === 'target' ? 'rgba(74,222,128,.2)' : 'var(--surface2)',
                border: `1px solid ${targetAvoid === 'target' ? 'var(--green)' : 'var(--border)'}`,
                borderRadius: 4, padding: '5px 12px',
                fontFamily: "'DM Mono', monospace", fontSize: 10,
                color: targetAvoid === 'target' ? 'var(--green)' : 'var(--text-dim)',
                cursor: 'pointer',
              }}
            >★ Target</button>
            <button
              onClick={() => toggleTargetAvoid(player.name, targetAvoid === 'avoid' ? null : 'avoid')}
              style={{
                background: targetAvoid === 'avoid' ? 'rgba(248,113,113,.2)' : 'var(--surface2)',
                border: `1px solid ${targetAvoid === 'avoid' ? 'var(--red)' : 'var(--border)'}`,
                borderRadius: 4, padding: '5px 12px',
                fontFamily: "'DM Mono', monospace", fontSize: 10,
                color: targetAvoid === 'avoid' ? 'var(--red)' : 'var(--text-dim)',
                cursor: 'pointer',
              }}
            >✕ Avoid</button>
          </div>

          {/* ── MANUAL NOTE EDITOR ── */}
          <SectionLabel>Manual Note</SectionLabel>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '10px 12px',
          }}>
            <textarea
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              placeholder="Add a personal note for this player (saved to player_notes.json)"
              rows={3}
              style={{
                width: '100%', resize: 'vertical', minHeight: 60,
                background: 'var(--surface2)', border: '1px solid var(--border2)',
                borderRadius: 4, padding: '8px 10px',
                fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text)',
                lineHeight: 1.5,
              }}
              aria-label="Manual note"
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={handleSaveNote}
                disabled={noteSaving || noteDraft.trim() === (effectiveNote || '').trim()}
                style={{
                  padding: '6px 14px', borderRadius: 4, cursor: noteSaving ? 'wait' : 'pointer',
                  background: 'var(--accent)', border: '1px solid var(--accent)',
                  fontFamily: "'DM Mono', monospace", fontSize: 10, fontWeight: 600,
                  color: '#0a0c10', letterSpacing: 1,
                }}
              >
                {noteSaving ? 'Saving…' : 'Save'}
              </button>
              {hasManual && (
                <button
                  onClick={handleDeleteNote}
                  disabled={noteSaving}
                  style={{
                    padding: '6px 14px', borderRadius: 4, cursor: noteSaving ? 'wait' : 'pointer',
                    background: 'transparent', border: '1px solid var(--red)',
                    fontFamily: "'DM Mono', monospace", fontSize: 10,
                    color: 'var(--red)',
                  }}
                >
                  Delete note
                </button>
              )}
            </div>
          </div>

          {/* ── SCOUT INTEL ── */}
          {(player.pl_note || player.role || player.health_pct != null) && (<>
            <SectionLabel>Scout Intel</SectionLabel>

            {/* Health + Role strip */}
            {(player.health_pct != null || player.role) && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {player.health_pct != null && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)',
                    borderRadius: 5, padding: '5px 10px',
                  }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)', letterSpacing: 1 }}>HEALTH</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: healthColor(player.health_pct), fontWeight: 600 }}>
                      {player.health_pct}%
                    </span>
                  </div>
                )}
                {player.role && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)',
                    borderRadius: 5, padding: '5px 10px', flex: 1,
                  }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)', letterSpacing: 1 }}>ROLE</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-dim)' }}>{player.role}</span>
                  </div>
                )}
              </div>
            )}

            {/* PL note */}
            {player.pl_note && player.pl_note !== effectiveNote && (
              <div style={{
                background: 'rgba(167,139,250,.04)', borderLeft: '2px solid rgba(167,139,250,.5)',
                borderRadius: '0 5px 5px 0', padding: '8px 12px',
                fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6,
              }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--purple)', letterSpacing: 1, marginRight: 6 }}>PL NOTE</span>
                {player.pl_note}
              </div>
            )}
          </>)}

          {/* ── FRY SIGNAL ── */}
          <SectionLabel>FRY Signal</SectionLabel>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: `${frySignal.color}0e`, border: `1px solid ${frySignal.color}33`,
            borderRadius: 7, padding: '10px 14px',
          }}>
            <span style={{ fontSize: 16 }}>{frySignal.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: frySignal.color, letterSpacing: 1, fontWeight: 600 }}>
                {frySignal.label}
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)', marginTop: 2 }}>
                ADJ {fmtDollar(player.adj_value)} · FRY BUDGET ${Math.round(fry.budget_current ?? 0)}M · {fry.slots_current ?? 0} slots
              </div>
            </div>
            {player.adj_value != null && fry.budget_current > 0 && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)' }}>% OF BUDGET</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: frySignal.color }}>
                  {Math.round((player.adj_value / fry.budget_current) * 100)}%
                </div>
              </div>
            )}
          </div>

          {/* ── NOMINATE ── */}
          <button
            onClick={() => { onNominate(player); onClose() }}
            style={{
              display: 'block', width: '100%', marginTop: 14,
              padding: '11px', borderRadius: 6, cursor: 'pointer',
              background: 'var(--accent)', border: '1px solid var(--accent)',
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 3,
              color: '#0a0c10', transition: 'opacity .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            ⚡ NOMINATE {player.name}
          </button>

        </div>
      </div>
    </div>
  )
}
