import React, { useState, useEffect, useMemo } from 'react'
import { useAuctionStore, TEAM_COLORS, FRY_NEEDS } from '../store/auctionStore.jsx'
import PlayerCard from './PlayerCard.jsx'

const TIER_COLORS = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)', 4: 'var(--t4)', 5: 'var(--t5)' }
const TIER_LABELS = { 1: 'TIER 1 · ELITE', 2: 'TIER 2 · PREMIUM', 3: 'TIER 3 · MID', 4: 'TIER 4 · VALUE', 5: 'TIER 5 · DEEP' }

// inv: true = lower raw is better (ERA, WHIP, HRA) — z-score sign is flipped
const BATTER_COLS = [
  { key: 'hr',       label: 'HR',   fmt: 0 },
  { key: 'r',        label: 'R',    fmt: 0 },
  { key: 'obp',      label: 'OBP',  fmt: 3 },
  { key: 'ops',      label: 'OPS',  fmt: 3 },
  { key: 'asb',      label: 'aSB',  fmt: 1 },
  { key: 'wrc_plus', label: 'wRC+', fmt: 0 },
  { key: 'war',      label: 'WAR',  fmt: 1 },
]
const SP_COLS = [
  { key: 'ip',           label: 'IP',     fmt: 0 },
  { key: 'k',            label: 'K',      fmt: 0 },
  { key: 'era',          label: 'ERA',    fmt: 2, inv: true },
  { key: 'whip',         label: 'WHIP',   fmt: 3, inv: true },
  { key: 'hra',          label: 'HRA',    fmt: 0, inv: true },
  { key: 'mgs',          label: 'MGS/GS', fmt: 2 },
  { key: 'war',          label: 'WAR',    fmt: 1 },
  { key: 'stuff_plus',   label: 'STF+',   fmt: 0, noZ: true },
  { key: 'pitching_plus',label: 'PTH+',   fmt: 0, noZ: true },
  { key: 'pp_era',       label: 'ppERA',  fmt: 2, inv: true, noZ: true },
  { key: 'athl_health',  label: 'H%',     fmt: 0, noZ: true },
]
const RP_COLS = [
  { key: 'ip',    label: 'IP',   fmt: 0 },
  { key: 'sv',    label: 'SV',   fmt: 0 },
  { key: 'hld',   label: 'HLD',  fmt: 0 },
  { key: 'k',     label: 'K',    fmt: 0 },
  { key: 'era',   label: 'ERA',  fmt: 2, inv: true },
  { key: 'vijay', label: 'VIJAY/G', fmt: 3 },
  { key: 'war',   label: 'WAR',  fmt: 1 },
]
const STAT_COLS = { batters: BATTER_COLS, sp: SP_COLS, rp: RP_COLS }

function fmt(v, dec = 0) {
  if (v == null || v === '') return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return v
  return dec ? n.toFixed(dec) : Math.round(n)
}

// ── Z-SCORE ABOVE REPLACEMENT ─────────────────────────────────────────────────
// Replacement level = average of Tier 5 (floor) unsold players for each stat.
// z = (player_stat − repl_avg) / stddev(all unsold)
// For inverse stats (ERA, WHIP, HRA): z = (repl_avg − player_stat) / stddev
function computeZScores(unsoldPlayers, statCols) {
  if (!unsoldPlayers.length) return {}

  const repl = unsoldPlayers.filter(p => p.tier === 5)
  const scores = {}

  for (const col of statCols.filter(c => !c.noZ)) {
    const key = col.key
    const allVals  = unsoldPlayers.map(p => p[key] ?? 0).filter(v => isFinite(v))
    const replVals = repl.length ? repl.map(p => p[key] ?? 0).filter(v => isFinite(v)) : allVals
    if (!allVals.length) continue

    const mean     = allVals.reduce((s, v) => s + v, 0) / allVals.length
    const replAvg  = replVals.reduce((s, v) => s + v, 0) / replVals.length
    const variance = allVals.reduce((s, v) => s + (v - mean) ** 2, 0) / allVals.length
    const stddev   = Math.sqrt(variance) || 1

    for (const p of unsoldPlayers) {
      if (!scores[p.name]) scores[p.name] = {}
      const raw = p[key] ?? 0
      scores[p.name][key] = col.inv
        ? (replAvg - raw) / stddev
        : (raw    - replAvg) / stddev
    }
  }
  return scores
}

export default function PlayerList() {
  const {
    batters, sp, rp,
    rankingsTab, setRankingsTab,
    projSystem, setProjSystem,
    fryLens,
    searchQuery, setSearch,
    tierFilter, toggleTier,
    sold, setNominatedPlayer,
    teams,
  } = useAuctionStore()

  const [sortCol, setSortCol]               = useState('adj_value')
  const [sortDir, setSortDir]               = useState(-1)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [tagFilter, setTagFilter]           = useState(new Set())
  const [showTagPicker, setShowTagPicker]   = useState(false)

  // Reset sort + filters when tab changes
  useEffect(() => { setSortCol('adj_value'); setSortDir(-1) }, [rankingsTab])
  useEffect(() => { setTagFilter(new Set()); setShowTagPicker(false) }, [rankingsTab])

  // Close tag picker on outside click
  useEffect(() => {
    if (!showTagPicker) return
    const fn = e => {
      if (!e.target.closest('[data-tag-picker]')) setShowTagPicker(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [showTagPicker])

  // Position filter — empty Set means "show all"
  const [posFilter, setPosFilter] = useState(new Set())
  useEffect(() => { setPosFilter(new Set()) }, [rankingsTab])

  const POS_OPTS = {
    batters: ['C','1B','2B','3B','SS','CF','RF'],
    sp:      ['SP','RP'],
    rp:      ['SP','RP'],
  }

  function togglePos(pos) {
    setPosFilter(prev => {
      const next = new Set(prev)
      if (next.has(pos)) next.delete(pos)
      else next.add(pos)
      return next
    })
  }

  const allForTab = rankingsTab === 'batters' ? batters : rankingsTab === 'sp' ? sp : rp
  const statCols  = STAT_COLS[rankingsTab]
  const fry       = teams['FRY'] || {}
  const showBoth  = projSystem === 'both'

  // Unsold pool for z-score computation — recomputes when sold changes
  const unsold = useMemo(
    () => allForTab.filter(p => !sold[p.name]),
    [allForTab, sold]
  )

  // Z-scores keyed by player name then stat key
  const zScores = useMemo(
    () => computeZScores(unsold, statCols),
    [unsold, statCols]
  )

  // All distinct tags present in the current unsold pool, sorted
  const availableTags = useMemo(() => {
    const s = new Set()
    unsold.forEach(p => p.tags?.forEach(t => s.add(t)))
    return [...s].sort()
  }, [unsold])

  function toggleTag(tag) {
    setTagFilter(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  const filtered = unsold.filter(p => {
    if (!tierFilter.has(p.tier)) return false
    // Position filter: OR logic
    if (posFilter.size > 0) {
      const playerPos = p.positions ?? []
      if (!playerPos.some(pos => posFilter.has(pos))) return false
    }
    // Tag filter: OR logic — player must have at least one selected tag
    if (tagFilter.size > 0) {
      const playerTags = new Set(p.tags ?? [])
      if (![...tagFilter].some(t => playerTags.has(t))) return false
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return p.name.toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q)
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0
    if (typeof bv === 'string' || typeof av === 'string')
      return sortDir * String(av || '').localeCompare(String(bv || ''))
    return sortDir * (bv - av)
  })

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d * -1)
    else { setSortCol(col); setSortDir(-1) }
  }

  const TH = ({ label, col, left, w }) => (
    <th
      onClick={() => handleSort(col)}
      style={{
        padding: '8px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
        textAlign: left ? 'left' : 'right',
        fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1,
        textTransform: 'uppercase',
        color: sortCol === col ? 'var(--accent)' : 'var(--text-dim)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        userSelect: 'none',
        minWidth: w ?? 60,
      }}
    >
      {label}{sortCol === col ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Controls bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', background: 'var(--surface2)',
        borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* Position tabs */}
        {['batters','sp','rp'].map(tab => (
          <button key={tab} onClick={() => setRankingsTab(tab)} style={{
            background: rankingsTab === tab ? 'var(--border2)' : 'none',
            border: `1px solid ${rankingsTab === tab ? 'var(--border2)' : 'transparent'}`,
            borderRadius: 4, padding: '5px 12px',
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 2,
            color: rankingsTab === tab ? 'var(--text)' : 'var(--text-dim)',
            cursor: 'pointer',
          }}>
            {tab === 'batters' ? '⚡ BAT' : tab === 'sp' ? '🎯 SP' : '🔒 RP'}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Projection toggle */}
        {[['batx','BATX'],['oopsy','OOPSY'],['both','BOTH']].map(([sys, label]) => (
          <button key={sys} onClick={() => setProjSystem(sys)} style={{
            background: projSystem === sys ? 'var(--accent)' : 'var(--surface)',
            border: `1px solid ${projSystem === sys ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 4, padding: '4px 9px',
            fontFamily: "'DM Mono', monospace", fontSize: 10,
            color: projSystem === sys ? '#000' : 'var(--text-dim)',
            cursor: 'pointer',
          }}>{label}</button>
        ))}

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Position filters — empty = show all */}
        {POS_OPTS[rankingsTab].map(pos => {
          const active = posFilter.has(pos)
          return (
            <button key={pos} onClick={() => togglePos(pos)} style={{
              background: active ? 'rgba(56,189,248,.18)' : 'transparent',
              border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
              borderRadius: 4, padding: '3px 9px',
              fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 0.5,
              color: active ? 'var(--blue)' : 'var(--text-dim)',
              cursor: 'pointer', transition: 'all .12s',
              fontWeight: active ? 600 : 400,
            }}>{pos}</button>
          )
        })}
        {posFilter.size > 0 && (
          <button onClick={() => setPosFilter(new Set())} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: "'DM Mono', monospace", fontSize: 9,
            color: 'var(--text-faint)', padding: '3px 4px',
          }} title="Clear position filter">✕</button>
        )}

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Tag filter */}
        <div style={{ position: 'relative' }} data-tag-picker>
          <button
            onClick={() => setShowTagPicker(v => !v)}
            style={{
              background: tagFilter.size > 0 ? 'rgba(167,139,250,.18)' : 'transparent',
              border: `1px solid ${tagFilter.size > 0 ? 'var(--purple)' : 'var(--border)'}`,
              borderRadius: 4, padding: '3px 9px',
              fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 0.5,
              color: tagFilter.size > 0 ? 'var(--purple)' : 'var(--text-dim)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            TAGS
            {tagFilter.size > 0 && (
              <span style={{
                background: 'var(--purple)', color: '#0a0c10',
                borderRadius: 10, padding: '0 5px', fontSize: 9, fontWeight: 700,
              }}>{tagFilter.size}</span>
            )}
            <span style={{ fontSize: 8, opacity: 0.6 }}>{showTagPicker ? '▲' : '▼'}</span>
          </button>

          {showTagPicker && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
              background: 'var(--surface)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: 10, minWidth: 220, maxWidth: 320,
              boxShadow: '0 12px 32px rgba(0,0,0,.6)',
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)', letterSpacing: 1 }}>
                  FILTER BY TAG · OR LOGIC
                </span>
                {tagFilter.size > 0 && (
                  <button onClick={() => setTagFilter(new Set())} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)',
                  }}>CLEAR ✕</button>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {availableTags.map(tag => {
                  const active = tagFilter.has(tag)
                  const cfg = TAG_CONFIG[tag] || { color: 'var(--muted)', bg: 'rgba(148,163,184,.10)' }
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      style={{
                        background: active ? cfg.bg : 'transparent',
                        border: `1px solid ${active ? cfg.color : 'var(--border2)'}`,
                        borderRadius: 3, padding: '3px 8px', cursor: 'pointer',
                        fontFamily: "'DM Mono', monospace", fontSize: 9,
                        color: active ? cfg.color : 'var(--text-dim)',
                        fontWeight: active ? 600 : 400,
                        letterSpacing: 0.4,
                      }}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Tier filters */}
        {[1,2,3,4,5].map(t => (
          <button key={t} onClick={() => toggleTier(t)} style={{
            background: tierFilter.has(t) ? 'rgba(255,255,255,.05)' : 'transparent',
            border: `1px solid ${tierFilter.has(t) ? TIER_COLORS[t] : 'var(--border)'}`,
            borderRadius: 4, padding: '3px 8px',
            fontFamily: "'DM Mono', monospace", fontSize: 9,
            color: tierFilter.has(t) ? TIER_COLORS[t] : 'var(--muted)',
            cursor: 'pointer',
          }}>T{t}</button>
        ))}

        {/* Search */}
        <input
          value={searchQuery}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '5px 10px', color: 'var(--text)',
            fontFamily: "'DM Mono', monospace", fontSize: 11,
            width: 140, outline: 'none',
          }}
        />
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
          {sorted.length}
        </span>
      </div>

      {/* ── Player card overlay ── */}
      {selectedPlayer && (
        <PlayerCard
          player={selectedPlayer}
          teams={teams}
          onClose={() => setSelectedPlayer(null)}
          onNominate={p => { setNominatedPlayer(p); setSelectedPlayer(null) }}
        />
      )}

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: 900 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              <TH label="#"      col="rank"             left  w={36} />
              <TH label="Player" col="name"             left  w={150} />
              <TH label="TM"     col="team"             left  w={36} />
              {showBoth ? (
                <>
                  <TH label="ADJ$"  col="adj_value"        w={72} />
                  <TH label="BATX"  col="est_value"        w={60} />
                  <TH label="OPSY"  col="oopsy_est_value"  w={60} />
                </>
              ) : (
                <TH label="ADJ$" col="adj_value" w={72} />
              )}
              {statCols.map(c => <TH key={c.key} label={c.label} col={c.key} w={68} />)}
              <TH label="ROFR"   col="rfa_team"           w={44} />
              {fryLens && <TH label="FRY" col="adj_value" w={90} />}
              <th style={{ ...thBase, minWidth: 50, background: 'var(--surface)' }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const tColor    = TIER_COLORS[p.tier] || 'var(--muted)'
              const rfaIsFry  = p.rfa_team === 'FRY'
              const prev      = i > 0 ? sorted[i-1] : null
              const showDivider = prev && prev.tier !== p.tier && !searchQuery
              const signal    = fryLens ? getFrySignal(p, fry) : null
              const pz        = zScores[p.name] || {}

              return (
                <React.Fragment key={`${p.name}_${p.team}`}>
                  {showDivider && (
                    <tr>
                      <td colSpan={99} style={{
                        padding: '3px 10px', fontSize: 9,
                        fontFamily: "'DM Mono', monospace", letterSpacing: 2,
                        textTransform: 'uppercase', color: 'var(--muted)',
                        background: 'rgba(0,0,0,.2)',
                        borderTop: `1px solid ${TIER_COLORS[p.tier]}33`,
                      }}>{TIER_LABELS[p.tier]}</td>
                    </tr>
                  )}
                  <tr
                    style={{ borderBottom: '1px solid #13151b', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#13161e'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    {/* Rank + tier pip */}
                    <td style={{ ...tdBase, textAlign: 'left', color: 'var(--muted)', fontSize: 10, width: 32, paddingLeft: 10 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tColor, display: 'inline-block', marginRight: 5, verticalAlign: 'middle', boxShadow: p.tier === 1 ? `0 0 5px ${tColor}` : 'none' }} />
                      {p.rank}
                    </td>

                    {/* Name + positions + tags */}
                    <td style={{ ...tdBase, textAlign: 'left', maxWidth: 200, minWidth: 160 }}>
                      <div
                        onClick={() => setSelectedPlayer(p)}
                        style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,.2)', textUnderlineOffset: 3 }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text)'}
                      >
                        {p.name}
                      </div>
                      {p.positions?.length > 0 && (
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)', marginTop: 1, letterSpacing: 0.3 }}>
                          {p.positions.join(' · ')}
                        </div>
                      )}
                      {p.tags?.length > 0 && (
                        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 2 }}>
                          {p.tags.map(tag => <MiniTag key={tag} tag={tag} />)}
                        </div>
                      )}
                    </td>

                    {/* MLB team */}
                    <td style={{ ...tdBase, textAlign: 'left', fontSize: 10, color: 'var(--text-dim)', letterSpacing: 0.5 }}>
                      {p.team || 'FA'}
                    </td>

                    {/* Values */}
                    {showBoth ? (
                      <>
                        <td style={{ ...tdNum, color: tColor, fontWeight: 600, fontSize: 13 }}>
                          ${p.adj_value}M
                          <ValueDelta adj={p.adj_value} base={p.est_value} />
                        </td>
                        <td style={{ ...tdNum, fontSize: 11 }}>${p.est_value}M</td>
                        <td style={{ ...tdNum, fontSize: 11, color: 'var(--purple)' }}>{p.oopsy_est_value != null ? `$${p.oopsy_est_value}M` : '—'}</td>
                      </>
                    ) : (
                      <td style={{ ...tdNum, color: tColor, fontWeight: 600, fontSize: 13 }}>
                        ${p.adj_value}M
                        <ValueDelta adj={p.adj_value} base={p.est_value} />
                      </td>
                    )}

                    {/* Stat cols — z-score above replacement on top, raw stat below */}
                    {statCols.map(c => {
                      const rawVal = projSystem === 'oopsy' && p[`oopsy_${c.key}`] != null
                        ? p[`oopsy_${c.key}`]
                        : p[c.key]
                      const z = pz[c.key]
                      if (c.noZ) {
                        // Athletic / display-only columns — no z-score, just colored value
                        return (
                          <td key={c.key} style={{ ...tdNum, verticalAlign: 'middle' }}>
                            <AthlStat val={rawVal} colKey={c.key} fmt={c.fmt} />
                          </td>
                        )
                      }
                      return (
                        <td key={c.key} style={{ ...tdNum, verticalAlign: 'top' }}>
                          {/* Z-score */}
                          {z != null ? (
                            <ZScore z={z} />
                          ) : (
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>—</span>
                          )}
                          {/* Raw stat */}
                          <div style={{ fontSize: 9, color: 'var(--muted)', lineHeight: 1.2, marginTop: 1 }}>
                            {fmt(rawVal, c.fmt)}
                          </div>
                        </td>
                      )
                    })}

                    {/* ROFR */}
                    <td style={{ ...tdNum, color: rfaIsFry ? 'var(--fry)' : p.rfa_team ? 'var(--orange)' : 'var(--muted)', fontWeight: rfaIsFry ? 600 : 400, fontSize: 10 }}>
                      {p.rfa_team || '—'}
                    </td>

                    {/* FRY signal */}
                    {fryLens && (
                      <td style={{ ...tdBase, textAlign: 'left' }}>
                        {signal && (
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: signal.color, letterSpacing: 0.5 }}>
                            {signal.icon} {signal.label}
                          </span>
                        )}
                      </td>
                    )}

                    {/* Nominate */}
                    <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                      <button
                        onClick={() => setNominatedPlayer(p)}
                        style={{
                          background: 'var(--surface2)', border: '1px solid var(--border2)',
                          borderRadius: 3, padding: '3px 8px',
                          fontFamily: "'DM Mono', monospace", fontSize: 9,
                          color: 'var(--text-dim)', cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                      >NOM</button>
                    </td>
                  </tr>
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Z-SCORE CELL ──────────────────────────────────────────────────────────────
// Color scale: strong positive = green, strong negative = red, near-zero = dim
function ZScore({ z }) {
  const abs  = Math.abs(z)
  // Color bands
  let color
  if (z >= 2.0)       color = '#4ade80'   // bright green
  else if (z >= 1.0)  color = '#86efac'   // light green
  else if (z >= 0.25) color = 'var(--text)'
  else if (z > -0.25) color = 'var(--text-dim)'
  else if (z > -1.0)  color = '#fca5a5'   // light red
  else                color = '#f87171'   // bright red

  const display = (z >= 0 ? '+' : '') + z.toFixed(2)

  return (
    <div style={{
      fontFamily: "'DM Mono', monospace",
      fontSize: 11, color, lineHeight: 1,
      fontWeight: abs >= 1.5 ? 600 : 400,
    }}>
      {display}
    </div>
  )
}

// ── VALUE DELTA ───────────────────────────────────────────────────────────────
// Shows how much adj_value has shifted from the static base est_value.
// Zero at auction start (fixed). Appears in green/red once sales move the pool.
function ValueDelta({ adj, base }) {
  const delta = Math.round(adj - base)
  if (delta === 0) return null
  return (
    <span style={{
      display: 'block', fontSize: 9,
      color: delta > 0 ? 'var(--green)' : 'var(--red)',
      fontFamily: "'DM Mono', monospace", lineHeight: 1.2,
    }}>
      {delta > 0 ? '+' : ''}{delta}
    </span>
  )
}

// ── FRY SIGNAL ────────────────────────────────────────────────────────────────
function getFrySignal(player, fry) {
  const budget  = fry.budget_current ?? 0
  const val     = player.adj_value ?? 1
  const pct     = budget > 0 ? val / budget : 0
  const posType = player.pa !== undefined ? 'BAT' : player.gs !== undefined ? 'SP' : 'RP'

  if (budget <= 0)    return { label: 'PASS',      color: 'var(--muted)',      icon: '—'  }
  if (pct > 0.5)      return { label: 'RISKY',     color: 'var(--red)',        icon: '⚠'  }
  if (pct > 0.35)     return { label: 'STRETCH',   color: 'var(--orange)',     icon: '↑'  }

  if (FRY_NEEDS.critical.includes(posType) && player.tier <= 2)
    return { label: 'MUST BID',  color: 'var(--fry)',   icon: '🎯' }
  if (FRY_NEEDS.critical.includes(posType))
    return { label: 'FILL NEED', color: 'var(--green)', icon: '★'  }

  const neededFill = (player.positions ?? []).filter(pos => FRY_NEEDS.needed.includes(pos))
  if (neededFill.length > 0 && player.tier <= 2)
    return { label: 'WANTED',    color: 'var(--blue)',   icon: '◎'  }

  if (player.tier === 1) return { label: 'ELITE',   color: 'var(--t1)',         icon: '⚡' }
  if (player.tier === 2) return { label: 'TARGET',  color: 'var(--t2)',         icon: '◎' }
  if (pct < 0.03)        return { label: 'ENDGAME', color: 'var(--text-dim)',   icon: '$1' }
  return                        { label: 'WATCH',   color: 'var(--text-faint)', icon: '·' }
}

// ── MINI TAG ──────────────────────────────────────────────────────────────────
const TAG_CONFIG = {
  ELITE:        { bg: 'rgba(200,241,53,.15)',  color: 'var(--t1)',      text: 'ELITE' },
  POWER_OBP:    { bg: 'rgba(200,241,53,.12)',  color: 'var(--t1)',      text: 'PWR+OBP' },
  HR_THREAT:    { bg: 'rgba(251,146,60,.12)',  color: 'var(--orange)',  text: 'HR' },
  SB_THREAT:    { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'SB' },
  OBP_ONLY:     { bg: 'rgba(56,189,248,.08)',  color: 'var(--blue)',    text: 'OBP' },
  WORKHORSE:    { bg: 'rgba(74,222,128,.12)',  color: 'var(--green)',   text: 'WRKHRS' },
  K_MACHINE:    { bg: 'rgba(200,241,53,.12)',  color: 'var(--t1)',      text: 'K MACH' },
  RATIOS_ACE:   { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'RATIOS' },
  GB_PITCHER:   { bg: 'rgba(74,222,128,.10)',  color: 'var(--green)',   text: 'GB' },
  MGS_ELITE:    { bg: 'rgba(200,241,53,.12)',  color: 'var(--t1)',      text: 'MGS+' },
  INNINGS_EAT:  { bg: 'rgba(74,222,128,.10)',  color: 'var(--green)',   text: 'INN' },
  CLOSER:       { bg: 'rgba(251,146,60,.15)',  color: 'var(--orange)',  text: 'CLOSER' },
  HOLDS_VALUE:  { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'HOLDS' },
  SAVES_SAFE:   { bg: 'rgba(74,222,128,.12)',  color: 'var(--green)',   text: 'SV ✓' },
  CLOSER_RISK:  { bg: 'rgba(248,113,113,.12)', color: 'var(--red)',     text: 'SV RISK' },
  ELITE_ERA:    { bg: 'rgba(74,222,128,.12)',  color: 'var(--green)',   text: 'ERA+' },
  VIJAY_ELITE:  { bg: 'rgba(200,241,53,.12)',  color: 'var(--t1)',      text: 'VIJAY+' },
  SLEEPER:      { bg: 'rgba(167,139,250,.12)', color: 'var(--purple)',  text: 'SLP' },
  BREAKOUT:     { bg: 'rgba(200,241,53,.15)',  color: 'var(--t1)',      text: 'BRKOUT' },
  BOUNCE_BACK:  { bg: 'rgba(200,241,53,.10)',  color: 'var(--t1)',      text: 'BNCE' },
  BUST:         { bg: 'rgba(248,113,113,.12)', color: 'var(--red)',     text: 'BUST' },
  INJURED:      { bg: 'rgba(248,113,113,.15)', color: 'var(--red)',     text: 'INJ' },
  IL:           { bg: 'rgba(248,113,113,.15)', color: 'var(--red)',     text: 'IL' },
  IL_START:     { bg: 'rgba(248,113,113,.15)', color: 'var(--red)',     text: 'IL-ST' },
  DTD:          { bg: 'rgba(251,146,60,.15)',  color: 'var(--orange)',  text: 'DTD' },
  DELAYED:      { bg: 'rgba(251,146,60,.10)',  color: 'var(--orange)',  text: 'DLY' },
  INJURY_RISK:  { bg: 'rgba(251,146,60,.12)',  color: 'var(--orange)',  text: 'INJ?' },
  ROLE_UNCLEAR: { bg: 'rgba(251,146,60,.10)',  color: 'var(--orange)',  text: 'ROLE?' },
  STASH:        { bg: 'rgba(167,139,250,.12)', color: 'var(--purple)',  text: 'STASH' },
  PROSPECT:     { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'PROSP' },
  DEEP_LEAGUE:  { bg: 'rgba(156,163,175,.10)', color: 'var(--muted)',   text: 'DEEP' },
  ADP_VALUE:    { bg: 'rgba(74,222,128,.12)',  color: 'var(--green)',   text: 'VALUE' },
  ADP_AVOID:    { bg: 'rgba(248,113,113,.12)', color: 'var(--red)',     text: 'AVOID' },
}

function MiniTag({ tag }) {
  const cfg = TAG_CONFIG[tag] || { bg: 'rgba(148,163,184,.10)', color: 'var(--muted)', text: tag }
  return (
    <span style={{
      display: 'inline-block',
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}44`,
      borderRadius: 2, padding: '1px 4px',
      fontFamily: "'DM Mono', monospace", fontSize: 7,
      letterSpacing: 0.4, lineHeight: 1.5, fontWeight: 600,
      textTransform: 'uppercase',
    }}>
      {cfg.text}
    </span>
  )
}

// ── ATHLETIC STAT CELL ────────────────────────────────────────────────────────
// Color-codes Stuff+/PTH+ above/below 100, ppERA like ERA, H% as health signal
function AthlStat({ val, colKey, fmt: fmtDec }) {
  if (val == null) return <span style={{ fontSize: 10, color: 'var(--muted)' }}>—</span>

  let color = 'var(--text-dim)'
  const n = parseFloat(val)

  if (colKey === 'stuff_plus' || colKey === 'pitching_plus' || colKey === 'location_plus') {
    if (n >= 115)      color = '#4ade80'
    else if (n >= 105) color = '#86efac'
    else if (n >= 95)  color = 'var(--text-dim)'
    else if (n >= 85)  color = '#fca5a5'
    else               color = '#f87171'
  } else if (colKey === 'pp_era') {
    if (n <= 3.00)      color = '#4ade80'
    else if (n <= 3.50) color = '#86efac'
    else if (n <= 4.00) color = 'var(--text-dim)'
    else if (n <= 4.50) color = '#fca5a5'
    else                color = '#f87171'
  } else if (colKey === 'athl_health') {
    if (n >= 90)       color = '#4ade80'
    else if (n >= 80)  color = '#86efac'
    else if (n >= 70)  color = 'var(--orange)'
    else               color = '#f87171'
  }

  const display = fmtDec ? n.toFixed(fmtDec) : Math.round(n)
  const suffix  = colKey === 'athl_health' ? '%' : ''

  return (
    <span style={{
      fontFamily: "'DM Mono', monospace",
      fontSize: 11, color,
      fontWeight: n >= 110 || (colKey === 'athl_health' && n < 75) ? 600 : 400,
    }}>
      {display}{suffix}
    </span>
  )
}

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const thBase = {
  padding: '8px 8px', textAlign: 'right',
  fontFamily: "'DM Mono', monospace", fontSize: 9,
  letterSpacing: 1, textTransform: 'uppercase',
  color: 'var(--text-dim)', borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap', userSelect: 'none',
}
const tdBase = { padding: '7px 10px', fontSize: 12, color: 'var(--text-dim)' }
const tdNum  = { padding: '7px 10px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-dim)' }
