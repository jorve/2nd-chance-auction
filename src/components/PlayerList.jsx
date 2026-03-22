import React, { useState, useEffect, useMemo, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowDown,
  faArrowUp,
  faBolt,
  faBullseye,
  faChevronDown,
  faChevronUp,
  faLock,
  faStar,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { useAuctionStore, TEAM_COLORS, MY_TEAM_ABBR, countTeamPicksByType, STARTER_SLOT_TARGETS } from '../store/auctionStore.jsx'
import PlayerCard from './PlayerCard.jsx'
import { getFrySignal } from '../utils/frySignal.js'
import { isBattersPosFilterUseful } from '../utils/hitterSlotting.js'

const TIER_COLORS = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)', 4: 'var(--t4)', 5: 'var(--t5)' }
const TIER_LABELS = { 1: 'TIER 1 · ELITE', 2: 'TIER 2 · PREMIUM', 3: 'TIER 3 · MID', 4: 'TIER 4 · VALUE', 5: 'TIER 5 · DEEP' }

// Classic 5×5 roto cats (+ IP for pitcher volume). inv: lower is better — z-score sign is flipped
const BATTER_COLS = [
  { key: 'avg', label: 'BA', fmt: 3 },
  { key: 'hr', label: 'HR', fmt: 0 },
  { key: 'r', label: 'R', fmt: 0 },
  { key: 'rbi', label: 'RBI', fmt: 0 },
  { key: 'sb', label: 'SB', fmt: 0 },
]
const SP_COLS = [
  { key: 'ip', label: 'IP', fmt: 0, noZ: true },
  { key: 'era', label: 'ERA', fmt: 2, inv: true },
  { key: 'k', label: 'K', fmt: 0 },
  { key: 'sv', label: 'SV', fmt: 0 },
  { key: 'w', label: 'W', fmt: 0 },
  { key: 'whip', label: 'WHIP', fmt: 3, inv: true },
  // The Athletic (2026_Athletic_SP_Rankings) — display-only, no z-score
  { key: 'athl_rank', label: 'ATH#', fmt: 0, noZ: true },
  { key: 'stuff_plus', label: 'STF+', fmt: 0, noZ: true },
  { key: 'location_plus', label: 'LOC+', fmt: 0, noZ: true },
  { key: 'pitching_plus', label: 'PTH+', fmt: 0, noZ: true },
  { key: 'athl_health', label: 'H%', fmt: 0, noZ: true },
  { key: 'athl_ip', label: 'ATH IP', fmt: 0, noZ: true },
  { key: 'pp_era', label: 'ppERA', fmt: 2, noZ: true },
  { key: 'pp_k_pct', label: 'ppK%', fmt: 1, noZ: true },
]
const RP_COLS = [
  { key: 'ip', label: 'IP', fmt: 0, noZ: true },
  { key: 'era', label: 'ERA', fmt: 2, inv: true },
  { key: 'k', label: 'K', fmt: 0 },
  { key: 'sv', label: 'SV', fmt: 0 },
  { key: 'w', label: 'W', fmt: 0 },
  { key: 'whip', label: 'WHIP', fmt: 3, inv: true },
]
const STAT_COLS = { batters: BATTER_COLS, sp: SP_COLS, rp: RP_COLS }
const VIRT_BASE_ROWS = 120
const VIRT_MIN_CHUNK = 180
const VIRT_MAX_CHUNK = 450
const EST_ROW_HEIGHT = 38
const VIRT_PREFETCH_VIEWPORTS = 1.25

// Table sort: numeric columns where a smaller raw value is better (rank, ratios)
const LOWER_IS_BETTER_SORT = new Set(['rank', 'athl_rank', 'era', 'whip', 'pp_era'])

function fmt(v, dec = 0) {
  if (v == null || v === '') return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return v
  return dec ? n.toFixed(dec) : Math.round(n)
}

function fmtAdjMoney(v) {
  const n = parseFloat(v)
  if (isNaN(n)) return '—'
  const abs = Math.abs(n)
  const absLabel = Number.isInteger(abs) ? String(abs) : abs.toFixed(1)
  return n < 0 ? `-$${absLabel}M` : `$${absLabel}M`
}

// ── Z-SCORE ABOVE REPLACEMENT ─────────────────────────────────────────────────
// Replacement level = average of $0.5M floor unsold players for each stat.
// Falls back to Tier 5 if no floor players are present yet.
// z = (player_stat − repl_avg) / stddev(all unsold)
// For inverse stats (ERA, WHIP, HRA): z = (repl_avg − player_stat) / stddev
function computeZScores(unsoldPlayers, statCols) {
  if (!unsoldPlayers.length) return {}

  const repl = unsoldPlayers.filter(p => p.est_value === 0.5).length
    ? unsoldPlayers.filter(p => p.est_value === 0.5)
    : unsoldPlayers.filter(p => p.tier === 5)
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
    auctionLog,
    teams,
    toggleTargetAvoid,
    getTargetAvoid,
  } = useAuctionStore()

  const [sortCol, setSortCol]               = useState('adj_value')
  const [sortDir, setSortDir]               = useState(1)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [tagFilter, setTagFilter]           = useState(new Set())
  const [showTagPicker, setShowTagPicker]   = useState(false)
  const [targetAvoidFilter, setTargetAvoidFilter] = useState(null) // 'target' | 'avoid' | null
  const [visibleCount, setVisibleCount] = useState(250)
  const scrollRef = useRef(null)
  const loadMoreRef = useRef(null)
  const pendingTargetRef = useRef(0)
  const drainingRef = useRef(false)

  // Reset sort + filters when tab changes
  useEffect(() => { setSortCol('adj_value'); setSortDir(1) }, [rankingsTab])
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
    batters: ['C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'CF', 'RF'],
    sp:      ['SP', 'RP'],
    rp:      ['SP', 'RP'],
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
  const fry       = teams[MY_TEAM_ABBR] || {}
  const showBoth  = projSystem === 'both'
  const showValueDelta = Object.keys(sold).length > 0

  // Unsold pool for z-score computation — recomputes when sold changes
  const unsold = useMemo(
    () => allForTab.filter(p => !sold[p.name]),
    [allForTab, sold]
  )

  /** Hide position chips for MY team when no unsold player could still fill that starter path */
  const posOptsForTab = useMemo(() => {
    if (rankingsTab !== 'batters') return POS_OPTS[rankingsTab]
    const { bat } = countTeamPicksByType(sold, MY_TEAM_ABBR)
    if (bat >= STARTER_SLOT_TARGETS.bat) return POS_OPTS.batters
    const battersByName = new Map(batters.map((b) => [b.name, b]))
    return POS_OPTS.batters.filter((pos) =>
      isBattersPosFilterUseful(MY_TEAM_ABBR, pos, auctionLog, battersByName, unsold),
    )
  }, [rankingsTab, sold, auctionLog, batters, unsold])

  useEffect(() => {
    if (rankingsTab !== 'batters') return
    const allow = new Set(posOptsForTab)
    setPosFilter((prev) => {
      let changed = false
      const next = new Set()
      for (const p of prev) {
        if (allow.has(p)) next.add(p)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [rankingsTab, posOptsForTab.join(',')])

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

  const filtered = useMemo(() => unsold.filter(p => {
    if (!tierFilter.has(p.tier)) return false
    if (posFilter.size > 0) {
      const playerPos = p.positions ?? []
      if (!playerPos.some(pos => posFilter.has(pos))) return false
    }
    if (tagFilter.size > 0) {
      const playerTags = new Set(p.tags ?? [])
      if (![...tagFilter].some(t => playerTags.has(t))) return false
    }
    if (targetAvoidFilter) {
      const flag = getTargetAvoid(p.name)
      if (!flag || flag !== targetAvoidFilter) return false
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return p.name.toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q)
    }
    return true
  }), [unsold, tierFilter, posFilter, tagFilter, searchQuery, targetAvoidFilter, getTargetAvoid])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = a[sortCol]
    const bv = b[sortCol]
    const aMissing = av == null || av === ''
    const bMissing = bv == null || bv === ''
    if (aMissing || bMissing) {
      if (aMissing && bMissing) return 0
      // For descending sorts (default), missing values go to the bottom.
      if (sortDir === 1) return aMissing ? 1 : -1
      return aMissing ? -1 : 1
    }
    if (typeof bv === 'string' || typeof av === 'string') {
      return sortDir * String(av).localeCompare(String(bv))
    }
    const delta = (bv ?? 0) - (av ?? 0)
    const invert = LOWER_IS_BETTER_SORT.has(sortCol) ? -1 : 1
    return sortDir * invert * delta
  }), [filtered, sortCol, sortDir])

  function getVirtualConfig() {
    const viewportH = scrollRef.current?.clientHeight || window.innerHeight || 900
    const viewportRows = Math.ceil(viewportH / EST_ROW_HEIGHT)
    return {
      initial: Math.max(VIRT_BASE_ROWS, viewportRows * 4),
      minChunk: Math.max(VIRT_MIN_CHUNK, viewportRows * 3),
      maxChunk: Math.max(VIRT_MAX_CHUNK, viewportRows * 8),
      rootMargin: Math.max(500, Math.round(viewportH * VIRT_PREFETCH_VIEWPORTS)),
    }
  }

  function scheduleDrain(totalRows) {
    if (drainingRef.current) return
    drainingRef.current = true

    const run = () => {
      let shouldContinue = false
      setVisibleCount(prev => {
        const target = Math.min(totalRows, pendingTargetRef.current)
        if (prev >= target) return prev
        const next = prev + Math.min(120, target - prev)
        shouldContinue = next < target
        return next
      })

      if (shouldContinue) {
        if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(run, { timeout: 50 })
        } else {
          window.setTimeout(run, 16)
        }
      } else {
        drainingRef.current = false
      }
    }

    run()
  }

  useEffect(() => {
    const cfg = getVirtualConfig()
    const initialVisible = Math.min(sorted.length, cfg.initial)
    pendingTargetRef.current = initialVisible
    drainingRef.current = false
    setVisibleCount(initialVisible)
  }, [rankingsTab, sortCol, sortDir, sorted.length])

  useEffect(() => {
    const onResize = () => {
      const cfg = getVirtualConfig()
      setVisibleCount(v => {
        const capped = Math.min(v, sorted.length)
        // Keep already-loaded rows, but ensure at least a viewport-aware baseline.
        const next = Math.max(capped, Math.min(sorted.length, cfg.initial))
        pendingTargetRef.current = Math.max(pendingTargetRef.current, next)
        return next
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [sorted.length])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || visibleCount >= sorted.length) return
    const cfg = getVirtualConfig()
    const obs = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          const dynamicStep = Math.ceil(visibleCount * 0.35)
          const step = Math.max(cfg.minChunk, Math.min(cfg.maxChunk, dynamicStep))
          const target = Math.min(sorted.length, visibleCount + step)
          pendingTargetRef.current = Math.max(pendingTargetRef.current, target)
          scheduleDrain(sorted.length)
        }
      },
      { root: scrollRef.current, rootMargin: `${cfg.rootMargin}px` },
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [sorted.length, visibleCount])

  const visibleRows = useMemo(
    () => sorted.slice(0, visibleCount),
    [sorted, visibleCount],
  )

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d * -1)
    else { setSortCol(col); setSortDir(1) }
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
      {label}
      {sortCol === col && (
        <span style={{ marginLeft: 5 }}>
          <FontAwesomeIcon icon={sortDir === -1 ? faArrowDown : faArrowUp} />
        </span>
      )}
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
            <FontAwesomeIcon icon={tab === 'batters' ? faBolt : tab === 'sp' ? faBullseye : faLock} />
            &nbsp;{tab === 'batters' ? 'BAT' : tab === 'sp' ? 'SP' : 'RP'}
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
        {posOptsForTab.map(pos => {
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
          }} title="Clear position filter">
            <FontAwesomeIcon icon={faXmark} />
          </button>
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
            <span style={{ fontSize: 8, opacity: 0.6 }}>
              <FontAwesomeIcon icon={showTagPicker ? faChevronUp : faChevronDown} />
            </span>
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
                  }}>
                    CLEAR <FontAwesomeIcon icon={faXmark} />
                  </button>
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

        {/* Target / Avoid filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[['target', faStar], ['avoid', faXmark]].map(([key, icon]) => (
            <button key={key} onClick={() => setTargetAvoidFilter(prev => prev === key ? null : key)} title={key === 'target' ? 'Target only' : 'Avoid only'} style={{
              background: targetAvoidFilter === key ? (key === 'target' ? 'rgba(74,222,128,.2)' : 'rgba(248,113,113,.2)') : 'transparent',
              border: `1px solid ${targetAvoidFilter === key ? (key === 'target' ? 'var(--green)' : 'var(--red)') : 'var(--border)'}`,
              borderRadius: 4, padding: '3px 6px', fontSize: 11,
              color: targetAvoidFilter === key ? (key === 'target' ? 'var(--green)' : 'var(--red)') : 'var(--text-dim)',
              cursor: 'pointer',
            }}><FontAwesomeIcon icon={icon} /></button>
          ))}
        </div>

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
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto', minWidth: 1580 }}>
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
              <TH label="VOL Z" col="vol_z" w={62} />
              <TH label="RISKx" col="vol_mult" w={62} />
              {statCols.map(c => <TH key={c.key} label={c.label} col={c.key} w={68} />)}
              <TH label="ROFR"   col="rfa_team"           w={44} />
              {fryLens && <TH label="ME" col="adj_value" w={90} />}
              <th style={{ ...thBase, minWidth: 50, background: 'var(--surface)' }} />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((p, i) => {
              const tColor    = TIER_COLORS[p.tier] || 'var(--muted)'
              const isAdjNegative = (p.adj_value ?? 0) < 0
              const rfaIsFry  = p.rfa_team === 'FRY'
              const prev      = i > 0 ? visibleRows[i-1] : null
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
                    className="player-row"
                    style={{ borderBottom: '1px solid #13151b', cursor: 'pointer' }}
                  >
                    {/* Rank + tier pip */}
                    <td style={{ ...tdBase, textAlign: 'left', color: 'var(--muted)', fontSize: 10, width: 32, paddingLeft: 10 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tColor, display: 'inline-block', marginRight: 5, verticalAlign: 'middle', boxShadow: p.tier === 1 ? `0 0 5px ${tColor}` : 'none' }} />
                      {p.rank}
                    </td>

                    {/* Name + positions + tags */}
                    <td style={{ ...tdBase, textAlign: 'left', maxWidth: 200, minWidth: 160 }}>
                      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginRight: 6 }}>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); toggleTargetAvoid(p.name, getTargetAvoid(p.name) === 'target' ? null : 'target') }}
                          title="Mark as target"
                          style={{
                            background: getTargetAvoid(p.name) === 'target' ? 'rgba(74,222,128,.25)' : 'transparent',
                            border: 'none', padding: '0 2px', cursor: 'pointer',
                            color: getTargetAvoid(p.name) === 'target' ? 'var(--green)' : 'var(--text-faint)',
                            fontSize: 12,
                          }}
                        ><FontAwesomeIcon icon={faStar} /></button>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); toggleTargetAvoid(p.name, getTargetAvoid(p.name) === 'avoid' ? null : 'avoid') }}
                          title="Mark as avoid"
                          style={{
                            background: getTargetAvoid(p.name) === 'avoid' ? 'rgba(248,113,113,.25)' : 'transparent',
                            border: 'none', padding: '0 2px', cursor: 'pointer',
                            color: getTargetAvoid(p.name) === 'avoid' ? 'var(--red)' : 'var(--text-faint)',
                            fontSize: 12,
                          }}
                        ><FontAwesomeIcon icon={faXmark} /></button>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedPlayer(p)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPlayer(p) } }}
                        style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,.2)', textUnderlineOffset: 3, background: 'none', border: 'none', padding: 0, textAlign: 'left', width: '100%', display: 'block' }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text)' }}
                        aria-label={`View details for ${p.name}${p.positions?.length ? `, ${p.positions.join(', ')}` : ''}`}
                      >
                        {p.name}{p.positions?.length ? ` | ${p.positions.join(' · ')}` : ''}
                      </button>
                      <MiniTagRow tags={p.tags} max={3} />
                    </td>

                    {/* MLB team */}
                    <td style={{ ...tdBase, textAlign: 'left', fontSize: 10, color: 'var(--text-dim)', letterSpacing: 0.5 }}>
                      {p.team || 'FA'}
                    </td>

                    {/* Values */}
                    {showBoth ? (
                      <>
                        <td style={{
                          ...tdNum,
                          color: isAdjNegative ? 'var(--red)' : tColor,
                          fontWeight: 600,
                          fontSize: 13,
                          background: isAdjNegative ? 'rgba(248,113,113,.06)' : 'transparent',
                          borderRadius: isAdjNegative ? 4 : 0,
                        }}>
                          {fmtAdjMoney(p.adj_value)}
                          <ValueDelta adj={p.adj_value} base={p.est_value} show={showValueDelta} />
                        </td>
                        <td style={{ ...tdNum, fontSize: 11 }}>${p.est_value}M</td>
                        <td style={{ ...tdNum, fontSize: 11, color: 'var(--purple)' }}>{p.oopsy_est_value != null ? `$${p.oopsy_est_value}M` : '—'}</td>
                      </>
                    ) : (
                      <td style={{
                        ...tdNum,
                        color: isAdjNegative ? 'var(--red)' : tColor,
                        fontWeight: 600,
                        fontSize: 13,
                        background: isAdjNegative ? 'rgba(248,113,113,.06)' : 'transparent',
                        borderRadius: isAdjNegative ? 4 : 0,
                      }}>
                        {fmtAdjMoney(p.adj_value)}
                        <ValueDelta adj={p.adj_value} base={p.est_value} show={showValueDelta} />
                      </td>
                    )}

                    <td style={{ ...tdNum, color: (p.vol_z ?? 0) > 0.75 ? 'var(--orange)' : (p.vol_z ?? 0) < -0.75 ? 'var(--green)' : 'var(--text-dim)' }}>
                      {p.vol_z != null ? p.vol_z.toFixed(2) : '—'}
                    </td>
                    <td style={{ ...tdNum, color: (p.vol_mult ?? 1) < 1 ? 'var(--orange)' : (p.vol_mult ?? 1) > 1 ? 'var(--green)' : 'var(--text-dim)' }}>
                      {p.vol_mult != null ? p.vol_mult.toFixed(3) : '—'}
                    </td>

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
                            <FontAwesomeIcon icon={signal.icon} /> {signal.label}
                          </span>
                        )}
                      </td>
                    )}

                    {/* Draft pick */}
                    <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setNominatedPlayer(p)}
                        aria-label={`Select ${p.name} for current snake pick`}
                        style={{
                          background: 'var(--surface2)', border: '1px solid var(--border2)',
                          borderRadius: 3, padding: '3px 8px',
                          fontFamily: "'DM Mono', monospace", fontSize: 9,
                          color: 'var(--text-dim)', cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
                      >PICK</button>
                    </td>
                  </tr>
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
        {visibleCount < sorted.length && (
          <div
            ref={loadMoreRef}
            style={{
              padding: '10px 12px',
              textAlign: 'center',
              color: 'var(--text-dim)',
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
            }}
          >
            Rendering {visibleCount} / {sorted.length} players...
          </div>
        )}
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
function ValueDelta({ adj, base, show = true }) {
  if (!show) return null
  const delta = Math.round((adj - base) * 10) / 10   // round to 1 decimal
  if (delta === 0) return null
  const display = Number.isInteger(delta) ? delta : delta.toFixed(1)
  return (
    <span style={{
      display: 'block', fontSize: 9,
      color: delta > 0 ? 'var(--green)' : 'var(--red)',
      fontFamily: "'DM Mono', monospace", lineHeight: 1.2,
    }}>
      {delta > 0 ? '+' : ''}{display}
    </span>
  )
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
  SAVES_SAFE:   { bg: 'rgba(74,222,128,.12)',  color: 'var(--green)',   text: 'SV SAFE' },
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
  AGING:        { bg: 'rgba(248,113,113,.08)', color: 'var(--red)',     text: 'AGING' },
  HIGH_FLOOR:   { bg: 'rgba(74,222,128,.10)',  color: 'var(--green)',   text: 'FLOOR' },
  VOLATILE:     { bg: 'rgba(251,146,60,.12)',  color: 'var(--orange)',  text: 'VOL' },
  UPSIDE_PLAY:  { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'UPSIDE' },
  BUST_RISK:    { bg: 'rgba(248,113,113,.14)', color: 'var(--red)',     text: 'BUST?' },
  STREAKY:      { bg: 'rgba(251,146,60,.10)',  color: 'var(--orange)',  text: 'STRKY' },
  PLATOON:      { bg: 'rgba(251,146,60,.10)',  color: 'var(--orange)',  text: 'PLTN' },
  SPEED_VALUE:  { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'SPEED' },
  HANDCUFF:     { bg: 'rgba(167,139,250,.12)', color: 'var(--purple)',  text: 'HANDC' },
  ROFR_TARGET:  { bg: 'rgba(200,241,53,.14)',  color: 'var(--fry)',     text: 'ROFR' },
  MULTI_POS:    { bg: 'rgba(56,189,248,.10)',  color: 'var(--blue)',    text: 'MULTI' },
  LDB_NEED:     { bg: 'rgba(74,222,128,.10)',  color: 'var(--green)',   text: 'NEED' },
  RP_SP_ELIG:   { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'RP+SP' },
  PL_RP_SP_ELIG:{ bg: 'rgba(56,189,248,.16)',  color: 'var(--blue)',    text: 'PL+RP+SP' },
}

function MiniTag({ tag }) {
  const cfg = TAG_CONFIG[tag] || { bg: 'rgba(148,163,184,.10)', color: 'var(--muted)', text: tag }
  return (
    <span style={{
      display: 'inline-block',
      background: `linear-gradient(180deg, ${cfg.bg}, rgba(8,10,14,.78))`,
      color: cfg.color,
      border: `1px solid ${cfg.color}88`,
      borderRadius: 999,
      padding: '1px 6px',
      fontFamily: "'DM Mono', monospace", fontSize: 7,
      letterSpacing: 0.3,
      lineHeight: 1.5,
      fontWeight: 700,
      textTransform: 'uppercase',
    }}>
      {cfg.text}
    </span>
  )
}

function MiniTagRow({ tags, max = 3 }) {
  if (!tags?.length) return null
  const shown = tags.slice(0, max)
  const hiddenCount = Math.max(0, tags.length - shown.length)
  const hidden = hiddenCount > 0 ? tags.slice(max) : []
  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 2 }}>
      {shown.map(tag => <MiniTag key={tag} tag={tag} />)}
      {hiddenCount > 0 && (
        <span
          title={hidden.join(', ')}
          style={{
            display: 'inline-block',
            background: 'rgba(148,163,184,.08)',
            color: 'var(--text-faint)',
            border: '1px solid var(--border2)',
            borderRadius: 999,
            padding: '1px 5px',
            fontFamily: "'DM Mono', monospace",
            fontSize: 7,
            letterSpacing: 0.3,
            lineHeight: 1.5,
            fontWeight: 700,
          }}
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}

// ── ATHLETIC STAT CELL ────────────────────────────────────────────────────────
// Color-codes Stuff+/PTH+ above/below 100, ppERA like ERA, H% as health signal
function AthlStat({ val, colKey, fmt: fmtDec }) {
  if (val == null) return <span style={{ fontSize: 10, color: 'var(--muted)' }}>—</span>

  let color = 'var(--text-dim)'
  const n = parseFloat(val)

  if (colKey === 'athl_rank') {
    if (n <= 15)       color = '#4ade80'
    else if (n <= 30)  color = '#86efac'
    else if (n <= 60)  color = 'var(--text-dim)'
    else if (n <= 90)  color = '#fca5a5'
    else                color = '#f87171'
  } else if (colKey === 'stuff_plus' || colKey === 'pitching_plus' || colKey === 'location_plus') {
    if (n >= 115)      color = '#4ade80'
    else if (n >= 105) color = '#86efac'
    else if (n >= 95)  color = 'var(--text-dim)'
    else if (n >= 85)  color = '#fca5a5'
    else               color = '#f87171'
  } else if (colKey === 'athl_ip') {
    if (n >= 180)      color = '#4ade80'
    else if (n >= 170) color = '#86efac'
    else if (n >= 150) color = 'var(--text-dim)'
    else if (n >= 130) color = '#fca5a5'
    else               color = '#f87171'
  } else if (colKey === 'pp_k_pct') {
    if (n >= 28)       color = '#4ade80'
    else if (n >= 25)  color = '#86efac'
    else if (n >= 22)  color = 'var(--text-dim)'
    else if (n >= 19)  color = '#fca5a5'
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
  const suffix  = colKey === 'athl_health' || colKey === 'pp_k_pct' ? '%' : ''

  return (
    <span style={{
      fontFamily: "'DM Mono', monospace",
      fontSize: 11, color,
      fontWeight: n >= 110 || (colKey === 'athl_health' && n < 75) || (colKey === 'athl_rank' && n <= 20) ? 600 : 400,
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
