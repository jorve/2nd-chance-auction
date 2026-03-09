import React, { useState, useEffect } from 'react'
import { useAuctionStore, TEAM_COLORS, FRY_NEEDS } from '../store/auctionStore.jsx'

const TIER_LABELS = { 1: 'TIER 1 · ELITE', 2: 'TIER 2 · PREMIUM', 3: 'TIER 3 · MID', 4: 'TIER 4 · VALUE', 5: 'TIER 5 · DEEP' }
const TIER_COLORS = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)', 4: 'var(--t4)', 5: 'var(--t5)' }

function fmtVal(v, decimals = 0) {
  if (v == null || v === '') return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return v
  return decimals ? n.toFixed(decimals) : Math.round(n)
}

// ── BATTER COLUMNS ────────────────────────────────────────────────────────────
const BATTER_COLS = [
  { key: 'hr',       label: 'HR',    fmt: 0 },
  { key: 'r',        label: 'R',     fmt: 0 },
  { key: 'obp',      label: 'OBP',   fmt: 3 },
  { key: 'ops',      label: 'OPS',   fmt: 3 },
  { key: 'rbi',      label: 'RBI',   fmt: 0 },
  { key: 'asb',      label: 'aSB',   fmt: 1 },
  { key: 'wrc_plus', label: 'wRC+',  fmt: 0 },
  { key: 'war',      label: 'WAR',   fmt: 1 },
]
const SP_COLS = [
  { key: 'gs',   label: 'GS',   fmt: 0 },
  { key: 'ip',   label: 'IP',   fmt: 0 },
  { key: 'k',    label: 'K',    fmt: 0 },
  { key: 'era',  label: 'ERA',  fmt: 2 },
  { key: 'whip', label: 'WHIP', fmt: 3 },
  { key: 'hra',  label: 'HRA',  fmt: 0 },
  { key: 'mgs',  label: 'MGS',  fmt: 0 },
  { key: 'war',  label: 'WAR',  fmt: 1 },
]
const RP_COLS = [
  { key: 'g',     label: 'G',    fmt: 0 },
  { key: 'ip',    label: 'IP',   fmt: 0 },
  { key: 'sv',    label: 'SV',   fmt: 0 },
  { key: 'hld',   label: 'HLD',  fmt: 0 },
  { key: 'bs',    label: 'BS',   fmt: 0 },
  { key: 'k',     label: 'K',    fmt: 0 },
  { key: 'era',   label: 'ERA',  fmt: 2 },
  { key: 'vijay', label: 'VIJAY',fmt: 1 },
  { key: 'war',   label: 'WAR',  fmt: 1 },
]

const STAT_COLS_BY_TAB = { batters: BATTER_COLS, sp: SP_COLS, rp: RP_COLS }

export default function RankingsView() {
  const {
    batters, sp, rp,
    rankingsTab, setRankingsTab,
    projSystem, setProjSystem,
    fryLens, toggleFryLens,
    searchQuery, setSearch,
    tierFilter, toggleTier,
    sold, setNominatedPlayer, setActiveTab,
    teams,
  } = useAuctionStore()

  const [sortCol, setSortCol] = useState('adj_value')
  const [sortDir, setSortDir] = useState(-1)

  // Bug fix: reset sort when switching tabs so stale column key doesn't break ordering
  useEffect(() => {
    setSortCol('adj_value')
    setSortDir(-1)
  }, [rankingsTab])

  const players = rankingsTab === 'batters' ? batters : rankingsTab === 'sp' ? sp : rp
  const statCols = STAT_COLS_BY_TAB[rankingsTab]
  const fry = teams['FRY'] || {}

  const filtered = players.filter(p => {
    if (sold[p.name]) return false
    if (!tierFilter.has(p.tier)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      // Bug fix: guard against null team (free agents have no MLB team)
      if (!p.name.toLowerCase().includes(q) && !(p.team || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0
    // Bug fix: string columns need localeCompare, not arithmetic subtraction (NaN otherwise)
    if (typeof bv === 'string' || typeof av === 'string') {
      return sortDir * String(av || '').localeCompare(String(bv || ''))
    }
    return sortDir * (bv - av)
  })

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d * -1)
    else { setSortCol(col); setSortDir(-1) }
  }

  function handleNominate(player) {
    setNominatedPlayer(player)
    setActiveTab('auction')
  }

  const showBoth = projSystem === 'both'
  const showOopsy = projSystem === 'oopsy' || showBoth

  const th = (label, col, extra = {}) => (
    <th
      key={col}
      onClick={() => handleSort(col)}
      style={{
        padding: '9px 10px', textAlign: 'right', cursor: 'pointer',
        fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1,
        textTransform: 'uppercase', whiteSpace: 'nowrap',
        color: sortCol === col ? 'var(--accent)' : 'var(--text-dim)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        ...extra,
      }}
    >
      {label}{sortCol === col ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div>
      {/* Sub-tabs + controls */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 24px', background: 'var(--surface2)',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
      }}>
        {/* Position tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {['batters','sp','rp'].map(tab => (
            <button key={tab} onClick={() => setRankingsTab(tab)} style={{
              background: rankingsTab === tab ? 'var(--border2)' : 'none',
              border: '1px solid ' + (rankingsTab === tab ? 'var(--border2)' : 'transparent'),
              borderRadius: 4, padding: '6px 14px',
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 2,
              color: rankingsTab === tab ? 'var(--text)' : 'var(--text-dim)',
              cursor: 'pointer', transition: 'all .15s',
            }}>{tab === 'batters' ? '⚡ Batters' : tab === 'sp' ? '🎯 SP' : '🔒 RP'}</button>
          ))}
        </div>

        {/* Projection system */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          {[['batx','BATX/ATC'],['oopsy','OOPSY'],['both','BOTH']].map(([sys, label]) => (
            <button key={sys} onClick={() => setProjSystem(sys)} style={{
              background: projSystem === sys ? 'var(--accent)' : 'var(--surface)',
              border: '1px solid ' + (projSystem === sys ? 'var(--accent)' : 'var(--border)'),
              borderRadius: 4, padding: '5px 12px',
              fontFamily: "'DM Mono', monospace", fontSize: 11,
              color: projSystem === sys ? '#000' : 'var(--text-dim)',
              cursor: 'pointer', transition: 'all .15s',
            }}>{label}</button>
          ))}
        </div>

        {/* Tier filters */}
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          {[1,2,3,4,5].map(t => (
            <button key={t} onClick={() => toggleTier(t)} style={{
              background: tierFilter.has(t) ? 'rgba(255,255,255,.05)' : 'transparent',
              border: `1px solid ${tierFilter.has(t) ? TIER_COLORS[t] : 'var(--border)'}`,
              borderRadius: 4, padding: '4px 9px',
              fontFamily: "'DM Mono', monospace", fontSize: 10,
              color: tierFilter.has(t) ? TIER_COLORS[t] : 'var(--muted)',
              cursor: 'pointer',
            }}>T{t}</button>
          ))}
        </div>

        {/* Search */}
        <input
          value={searchQuery}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search player or team..."
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '6px 12px', color: 'var(--text)',
            fontFamily: "'DM Mono', monospace", fontSize: 12,
            width: 200, outline: 'none',
          }}
        />

        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-dim)' }}>
          {sorted.length} players
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {th('#', 'rank', { textAlign: 'left', width: 40 })}
              {th('Player', 'name', { textAlign: 'left', minWidth: 160 })}
              {th('TM', 'team', { textAlign: 'left' })}
              {th('ROFR', 'rfa_team', { textAlign: 'left' })}
              {/* Value columns */}
              {th('ADJ $', 'adj_value', { color: sortCol === 'adj_value' ? 'var(--accent)' : 'var(--accent-dim)' })}
              {showBoth
                ? <><th style={thStyle}>BATX $</th><th style={thStyle}>OOPSY $</th></>
                : th(projSystem === 'oopsy' ? 'OOPSY $' : 'BASE $', 'est_value')}
              {showBoth && <><th style={thStyle}>BATX #</th><th style={thStyle}>OOPSY #</th></>}
              {/* Bug fix: removed duplicate {!showBoth && th('RANK','rank')} — '#' column at start already covers this */}
              {/* Stat columns — primary system */}
              {!showOopsy && statCols.map(c => th(c.label, c.key))}
              {/* Both systems — Bug fix: Fragment needs key for React list reconciliation */}
              {showBoth && statCols.map(c => (
                <React.Fragment key={c.key}>
                  <th style={thStyle}>{c.label}</th>
                  <th style={{ ...thStyle, color: 'var(--purple)', opacity: .7 }}>{c.label}ᵒ</th>
                </React.Fragment>
              ))}
              {/* OOPSY only */}
              {projSystem === 'oopsy' && !showBoth && statCols.map(c => th(`${c.label}ᵒ`, `oopsy_${c.key}`))}
              {/* LDB score */}
              {th(showBoth ? 'LDB' : 'LDB', 'ldb_score')}
              {showBoth && <th style={thStyle}>LDBᵒ</th>}
              {/* FRY lens */}
              {fryLens && <th style={{ ...thStyle, color: 'var(--fry)', textAlign: 'left' }}>FRY SIGNAL</th>}
              {/* Nominate */}
              <th style={{ ...thStyle, minWidth: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => {
              const soldInfo = sold[p.name]
              const isFry = p.is_fry_keeper
              const rfaIsFry = p.rfa_team === 'FRY'
              const tierColor = TIER_COLORS[p.tier]
              const adjValueDelta = p.adj_value - p.est_value
              const pctBudget = fry.budget_current > 0 ? (p.adj_value / fry.budget_current) * 100 : 0
              const frySignal = getFrySignal(p, fry, adjValueDelta)

              return (
                <tr key={p.name} style={{
                  borderBottom: '1px solid #0e111a',
                  background: isFry ? 'rgba(200,241,53,.03)' : 'transparent',
                  transition: 'background .1s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = '#0d111c'}
                  onMouseLeave={e => e.currentTarget.style.background = isFry ? 'rgba(200,241,53,.03)' : 'transparent'}
                >
                  {/* Rank */}
                  <td style={{ padding: '8px 10px', fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-dim)', textAlign: 'left' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: tierColor, marginRight: 6, boxShadow: p.tier === 1 ? `0 0 6px ${tierColor}` : 'none' }} />
                    {p.rank}
                  </td>

                  {/* Name */}
                  <td style={{ padding: '8px 10px', textAlign: 'left', minWidth: 160 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 500, fontSize: 13 }}>{p.name}</span>
                    {isFry && <span style={{ marginLeft: 6, fontSize: 9, fontFamily: "'DM Mono', monospace", background: 'var(--fry)', color: '#000', padding: '1px 5px', borderRadius: 3 }}>FRY</span>}
                  </td>

                  {/* MLB Team */}
                  <td style={tdDimStyle}>{p.team || '—'}</td>

                  {/* ROFR */}
                  <td style={{ ...tdDimStyle, color: rfaIsFry ? 'var(--fry)' : p.rfa_team ? 'var(--orange)' : 'var(--text-faint)', fontWeight: rfaIsFry ? 600 : 400 }}>
                    {p.rfa_team || '—'}
                  </td>

                  {/* Adj value */}
                  <td style={{ ...tdNumStyle, color: tierColor, fontWeight: 600, fontSize: 14 }}>
                    ${p.adj_value}M
                    {adjValueDelta !== 0 && (
                      <span style={{ display: 'block', fontSize: 9, color: adjValueDelta > 0 ? 'var(--green)' : 'var(--red)', fontFamily: "'DM Mono', monospace" }}>
                        {adjValueDelta > 0 ? '+' : ''}{adjValueDelta}
                      </span>
                    )}
                  </td>

                  {/* Base/OOPSY values */}
                  {showBoth ? (
                    <>
                      <td style={tdNumStyle}>${p.est_value}M</td>
                      <td style={{ ...tdNumStyle, color: 'var(--purple)', opacity: .8 }}>{p.oopsy_est_value != null ? `$${p.oopsy_est_value}M` : '—'}</td>
                    </>
                  ) : (
                    <td style={tdNumStyle}>
                      ${projSystem === 'oopsy' && p.oopsy_est_value != null ? p.oopsy_est_value : p.est_value}M
                    </td>
                  )}

                  {/* Rank columns */}
                  {showBoth ? (
                    <>
                      <td style={tdNumStyle}>{p.rank}</td>
                      <td style={{ ...tdNumStyle, color: 'var(--purple)', opacity: .8 }}>{p.oopsy_rank ?? '—'}</td>
                    </>
                  ) : (
                    <td style={tdNumStyle}>{p.rank}</td>
                  )}

                  {/* Stat columns */}
                  {!showOopsy && statCols.map(c => (
                    <td key={c.key} style={tdNumStyle}>{fmtVal(p[c.key], c.fmt)}</td>
                  ))}
                  {showBoth && statCols.map(c => (
                    <React.Fragment key={c.key}>
                      <td style={tdNumStyle}>{fmtVal(p[c.key], c.fmt)}</td>
                      <td style={{ ...tdNumStyle, color: 'var(--purple)', opacity: .7 }}>
                        {fmtVal(p[`oopsy_${c.key}`], c.fmt)}
                      </td>
                    </React.Fragment>
                  ))}
                  {projSystem === 'oopsy' && !showBoth && statCols.map(c => (
                    <td key={c.key} style={tdNumStyle}>{fmtVal(p[`oopsy_${c.key}`] ?? p[c.key], c.fmt)}</td>
                  ))}

                  {/* LDB Score */}
                  <td style={{ ...tdNumStyle, color: 'var(--text-dim)' }}>
                    {fmtVal(p.ldb_score, 1)}
                  </td>
                  {showBoth && (
                    <td style={{ ...tdNumStyle, color: 'var(--purple)', opacity: .7 }}>
                      {p.oopsy_ldb_score != null ? fmtVal(p.oopsy_ldb_score, 1) : '—'}
                    </td>
                  )}

                  {/* FRY signal */}
                  {fryLens && (
                    <td style={{ padding: '6px 10px', textAlign: 'left', minWidth: 120 }}>
                      <FrySignal signal={frySignal} />
                    </td>
                  )}

                  {/* Nominate button */}
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleNominate(p)}
                      style={{
                        background: 'var(--surface2)', border: '1px solid var(--border2)',
                        borderRadius: 4, padding: '4px 10px',
                        fontFamily: "'DM Mono', monospace", fontSize: 10,
                        color: 'var(--text-dim)', cursor: 'pointer',
                        transition: 'all .15s', whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                    >
                      NOM →
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── FRY SIGNAL ────────────────────────────────────────────────────────────────
// Derives player position type from its data shape
function getPlayerPosType(p) {
  if (p.pa !== undefined) return 'BAT'
  if (p.gs !== undefined) return 'SP'
  return 'RP'
}

function getFrySignal(player, fry, valueDelta) {
  const budget = fry.budget_current ?? 0
  const slots  = fry.slots_current ?? 0
  const val    = player.adj_value ?? player.est_value ?? 1
  const pct    = budget > 0 ? val / budget : 0
  const posType = getPlayerPosType(player)

  // Hard blocks
  if (budget <= 0 || slots <= 0)
    return { label: 'PASS', color: 'var(--muted)', icon: '—', note: 'Budget/slots depleted' }

  // Overspend risk — check first regardless of need
  if (pct > 0.5)
    return { label: 'RISKY', color: 'var(--red)', icon: '⚠', note: `${Math.round(pct*100)}% of remaining budget` }
  if (pct > 0.35)
    return { label: 'STRETCH', color: 'var(--orange)', icon: '↑', note: `${Math.round(pct*100)}% of remaining budget` }

  // Critical positional needs (SP almost empty, RP zero VIJAY per rules)
  const isCritical = FRY_NEEDS.critical.includes(posType)
  if (isCritical && player.tier <= 2)
    return { label: 'MUST BID', color: 'var(--fry)', icon: '🎯', note: `Critical FRY need · T${player.tier}` }
  if (isCritical)
    return { label: 'FILL NEED', color: 'var(--green)', icon: '★', note: `FRY needs ${posType}` }

  // Secondary positional needs (SS, 2B) — requires position file
  const playerPos = player.positions ?? []
  const neededFill = playerPos.filter(pos => FRY_NEEDS.needed.includes(pos))
  if (neededFill.length > 0 && player.tier <= 2)
    return { label: 'WANTED', color: 'var(--blue)', icon: '◎', note: `Fills ${neededFill.join('/')} gap` }

  // Value delta signals
  if (valueDelta < -4)
    return { label: 'BUY', color: 'var(--green)', icon: '↓$', note: `$${Math.abs(valueDelta)}M under base value` }
  if (valueDelta > 4)
    return { label: 'RISING', color: 'var(--orange)', icon: '↗', note: `+$${valueDelta}M vs base (market heating)` }

  // Tier signals
  if (player.tier === 1)
    return { label: 'ELITE', color: 'var(--t1)', icon: '⚡', note: 'Top tier · bid aggressively' }
  if (player.tier === 2)
    return { label: 'TARGET', color: 'var(--t2)', icon: '◎', note: 'Premium · budget accordingly' }

  if (pct < 0.03)
    return { label: 'ENDGAME', color: 'var(--text-dim)', icon: '$1', note: 'Cheap depth · $1–3M range' }

  return { label: 'WATCH', color: 'var(--text-faint)', icon: '·', note: 'Monitor — no urgent signal' }
}

function FrySignal({ signal }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: signal.color, fontSize: 14 }}>{signal.icon}</span>
      <div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: signal.color, letterSpacing: 1 }}>
          {signal.label}
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)' }}>
          {signal.note}
        </div>
      </div>
    </div>
  )
}

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const thStyle = {
  padding: '9px 10px', textAlign: 'right',
  fontFamily: "'DM Mono', monospace", fontSize: 10,
  letterSpacing: 1, textTransform: 'uppercase',
  color: 'var(--text-dim)', borderBottom: '1px solid var(--border)',
  background: 'var(--surface)', whiteSpace: 'nowrap',
}
const tdNumStyle = {
  padding: '8px 10px', textAlign: 'right',
  fontFamily: "'DM Mono', monospace", fontSize: 12,
  color: 'var(--text-dim)',
}
const tdDimStyle = {
  padding: '8px 10px', textAlign: 'left',
  fontFamily: "'DM Mono', monospace", fontSize: 11,
  color: 'var(--text-dim)', letterSpacing: 0.5,
}
