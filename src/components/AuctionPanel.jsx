import { useState, useRef, useEffect } from 'react'
import { useApiKeyStore } from '../store/apiKeyStore.js'
import { useAuctionStore, TEAMS_LIST, TEAM_COLORS, stepUp, stepDown, isValidBidPrice, fmtPrice, snapToValidIncrement, FRY_NEEDS } from '../store/auctionStore.jsx'

function getType(p) {
  if (!p) return null
  if (p.pa !== undefined) return 'BAT'
  if (p.gs !== undefined) return 'SP'
  return 'RP'
}

function getKeyStats(p, type) {
  if (!p) return []
  if (type === 'BAT') return [['HR', p.hr], ['OBP', p.obp?.toFixed(3)], ['OPS', p.ops?.toFixed(3)], ['aSB', p.asb?.toFixed(1)], ['wRC+', p.wrc_plus], ['WAR', p.war?.toFixed(1)]]
  if (type === 'SP') return [['GS', p.gs], ['IP', p.ip], ['K', p.k], ['ERA', p.era?.toFixed(2)], ['MGS', p.mgs ? Math.round(p.mgs) : '—'], ['WAR', p.war?.toFixed(1)]]
  return [['SV', p.sv], ['HLD', p.hld], ['K', p.k], ['ERA', p.era?.toFixed(2)], ['VIJAY', p.vijay?.toFixed(1)], ['WAR', p.war?.toFixed(1)]]
}

function flagAmbiguous(results) {
  const lastNames = results.map(p => p.name.split(' ').slice(-1)[0].toLowerCase())
  return results.map((_, i) => lastNames.filter(n => n === lastNames[i]).length > 1)
}

// ── AI INTEL ──────────────────────────────────────────────────────────────────
async function fetchPlayerIntel(player, type, apiKey, signal) {
  if (!apiKey) throw new Error('No API key set — click SET API KEY in the top bar')
  const posLabel = type === 'BAT' ? 'hitter' : type === 'SP' ? 'starting pitcher' : 'relief pitcher'
  const prompt = `Search for the latest 2026 MLB news on ${player.name} (${player.team || 'Free Agent'}, ${posLabel}).

Find and summarize:
1. Current injury status / health flags
2. Role clarity (rotation spot confirmed? closer locked in? lineup position?)
3. 2026 fantasy outlook — upside and risks
4. Any recent transactions, spring training notes, or team context

Reply with exactly 4 bullet points using this format:
• [HEALTH] ...
• [ROLE] ...
• [OUTLOOK] ...
• [CONTEXT] ...

Each bullet ≤ 25 words. Be direct and specific. Flag any uncertainty clearly.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${response.status}`)
  }
  const data = await response.json()

  const textContent = data.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')

  return textContent || 'No intel available.'
}

// ── BID STEPPER ───────────────────────────────────────────────────────────────
function BidStepper({ value, onChange, maxBudget }) {
  const [inputMode, setInputMode] = useState(false)
  const [rawInput, setRawInput] = useState('')
  const inputRef = useRef()

  useEffect(() => { if (inputMode && inputRef.current) inputRef.current.select() }, [inputMode])

  const n = parseFloat(value) || 0
  const isOver = maxBudget > 0 && n > maxBudget
  const display = n % 1 === 0 ? `${n}` : `${n.toFixed(1)}`

  function commitRaw() {
    onChange(snapToValidIncrement(parseFloat(rawInput) || 0.5))
    setInputMode(false)
  }

  return (
    <div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1.5, color: 'var(--text-dim)', marginBottom: 5, textTransform: 'uppercase' }}>
        Final Price ($M)
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', marginBottom: 6 }}>
        <button onClick={() => onChange(stepDown(value))} disabled={n <= 0.5} style={{ ...stepBtn, borderRadius: '5px 0 0 5px', opacity: n <= 0.5 ? 0.3 : 1 }}>−</button>
        {inputMode ? (
          <input ref={inputRef} value={rawInput} onChange={e => setRawInput(e.target.value)}
            onBlur={commitRaw} onKeyDown={e => { if (e.key === 'Enter') commitRaw(); if (e.key === 'Escape') setInputMode(false) }}
            style={{ flex: 1, textAlign: 'center', background: 'var(--surface2)', border: '1px solid var(--accent)', borderLeft: 'none', borderRight: 'none', color: 'var(--accent)', fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 2, outline: 'none' }}
          />
        ) : (
          <button onClick={() => { setRawInput(display); setInputMode(true) }}
            title="Click to type · ↑↓ to step"
            style={{ flex: 1, textAlign: 'center', background: 'var(--surface2)', border: `1px solid ${isOver ? 'var(--red)' : 'var(--border2)'}`, borderLeft: 'none', borderRight: 'none', color: isOver ? 'var(--red)' : 'var(--text)', fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 2, cursor: 'text', padding: '8px 0' }}>
            ${display}M
          </button>
        )}
        <button onClick={() => onChange(stepUp(value))} style={{ ...stepBtn, borderRadius: '0 5px 5px 0' }}>+</button>
      </div>

      {/* Quick picks */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 4 }}>
        {[0.5, 1, 2, 5, 10, 15, 20, 25, 30, 40, 50].map(q => (
          <button key={q} onClick={() => onChange(q)} style={{
            background: n === q ? 'var(--accent)' : 'var(--surface)',
            border: `1px solid ${n === q ? 'var(--accent)' : 'var(--border2)'}`,
            borderRadius: 3, padding: '2px 7px',
            fontFamily: "'DM Mono', monospace", fontSize: 9,
            color: n === q ? '#000' : 'var(--text-dim)', cursor: 'pointer',
          }}>${q}</button>
        ))}
      </div>
      {isOver && <div style={{ fontSize: 10, color: 'var(--red)', fontFamily: "'DM Mono', monospace" }}>⚠ Over budget (${maxBudget?.toFixed(1)}M left)</div>}
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function AuctionPanel() {
  const {
    batters, sp, rp, sold,
    nominatedPlayer, setNominatedPlayer,
    bidTeam, setBidTeam,
    bidPrice, setBidPrice,
    confirmSale,
    teams, resetAuction,
  } = useAuctionStore()

  const { apiKey } = useApiKeyStore()

  const [search, setSearch] = useState('')
  const [focused, setFocused] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [intel, setIntel] = useState(null)            // { text, loading, error, player }
  const searchRef = useRef()
  const resetModalRef = useRef(null)

  const player = nominatedPlayer
  const type = getType(player)
  const fry = teams['FRY'] || {}
  const bidTeamData = bidTeam ? teams[bidTeam] : null
  const price = parseFloat(bidPrice) || 0
  const canConfirm = player && bidTeam && isValidBidPrice(bidPrice) && price <= (bidTeamData?.budget_current ?? Infinity)

  const allPlayers = [...batters, ...sp, ...rp].filter(p => !sold[p.name])
  const searchResults = search.trim().length >= 1
    ? allPlayers.filter(p => p.name.toLowerCase().includes(search.toLowerCase().trim()))
        .sort((a, b) => a.name.toLowerCase().indexOf(search.toLowerCase()) - b.name.toLowerCase().indexOf(search.toLowerCase()))
        .slice(0, 8)
    : []
  const ambiguous = flagAmbiguous(searchResults)

  // Fetch AI intel when player or API key changes (cancel stale requests)
  useEffect(() => {
    if (!player) { setIntel(null); return }
    const abort = new AbortController()
    const t = getType(player)
    setIntel({ loading: true, text: null, error: null, player: player.name })
    fetchPlayerIntel(player, t, apiKey, abort.signal)
      .then(text => {
        if (abort.signal.aborted) return
        setIntel({ loading: false, text, error: null, player: player.name })
      })
      .catch(err => {
        if (abort.signal.aborted || err?.name === 'AbortError') return
        setIntel({ loading: false, text: null, error: err.message, player: player.name })
      })
    return () => abort.abort()
  }, [player?.name, apiKey])

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e) { if (searchRef.current && !searchRef.current.contains(e.target)) setFocused(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Enter to confirm sale when form is ready (single-user draft speed)
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Enter' && canConfirm && !e.target.matches('input, textarea')) {
        e.preventDefault()
        confirmSale()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [canConfirm, confirmSale])

  // Reset modal focus trap
  useEffect(() => {
    if (!showReset) return
    const el = resetModalRef.current
    if (!el) return
    const focusables = el.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (first) first.focus()
    function trap(e) {
      if (e.key === 'Escape') { setShowReset(false); return }
      if (e.key !== 'Tab') return
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', trap)
    return () => document.removeEventListener('keydown', trap)
  }, [showReset])

  const tierColors = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)', 4: 'var(--t4)', 5: 'var(--t5)' }
  const tColor = player ? (tierColors[player.tier] || 'var(--text-dim)') : 'var(--text-dim)'

  // FRY signal for current player
  const frySignal = player ? getFrySignal(player, fry, type) : null

  // Price context
  const over = player ? parseFloat((price - player.adj_value).toFixed(1)) : 0
  const pctBudget = bidTeamData?.budget_current > 0 ? ((price / bidTeamData.budget_current) * 100).toFixed(0) : 0

  return (
    <div style={{ padding: 16 }}>

      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 3, color: 'var(--text-dim)' }}>
          LIVE AUCTION
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {player && (
            <button onClick={() => { setNominatedPlayer(null); setIntel(null) }} style={ghostBtn}>
              CLEAR ✕
            </button>
          )}
          <button onClick={() => setShowReset(true)} style={{ ...ghostBtn, color: 'var(--red)', borderColor: 'var(--border)' }}>
            RESET
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div style={{ marginBottom: 14, position: 'relative' }} ref={searchRef}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setFocused(true) }}
          onFocus={() => setFocused(true)}
          placeholder={player ? `${player.name} nominated — search to change` : 'Nominate a player...'}
          style={{
            width: '100%', background: 'var(--surface)',
            border: `1px solid ${focused ? 'var(--accent)' : 'var(--border2)'}`,
            borderRadius: focused && searchResults.length > 0 ? '6px 6px 0 0' : 6,
            padding: '9px 12px', color: 'var(--text)',
            fontFamily: "'DM Mono', monospace", fontSize: 12, outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {/* Dropdown */}
        {focused && searchResults.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
            background: 'var(--surface)', border: '1px solid var(--accent)',
            borderTop: 'none', borderRadius: '0 0 8px 8px',
            boxShadow: '0 12px 32px rgba(0,0,0,.6)', maxHeight: 360, overflowY: 'auto',
          }}>
            {searchResults.map((p, idx) => {
              const pt = getType(p)
              const tc = tierColors[p.tier] || 'var(--t5)'
              const isAmb = ambiguous[idx]
              return (
                <button
                  key={`${p.name}_${p.team}_${idx}`}
                  onMouseDown={e => { e.preventDefault(); setNominatedPlayer(p); setSearch(''); setFocused(false) }}
                  style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: '9px 12px', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: tc, display: 'inline-block', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                        {isAmb && <span style={{ fontSize: 8, background: 'rgba(251,146,60,.15)', color: 'var(--orange)', border: '1px solid var(--orange)', padding: '1px 4px', borderRadius: 2 }}>SIMILAR NAME</span>}
                        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: "'DM Mono', monospace" }}>{p.team || 'FA'}</span>
                        <span style={{ fontSize: 9, color: pt === 'BAT' ? 'var(--t1)' : pt === 'SP' ? 'var(--blue)' : 'var(--orange)', fontFamily: "'DM Mono', monospace" }}>{pt}</span>
                        <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: "'DM Mono', monospace" }}>#{p.rank} T{p.tier}</span>
                      </div>
                    </div>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: tc, flexShrink: 0 }}>${p.adj_value}M</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Player card ── */}
      {player && (
        <div style={{
          background: 'var(--surface)', border: `1px solid ${tColor}44`,
          borderRadius: 8, padding: '12px 14px', marginBottom: 12,
          boxShadow: `0 0 20px ${tColor}0d`,
        }}>
          {/* Name + meta */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{player.name}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{player.team || 'FA'}</span>
                <TypeBadge type={type} />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: tColor }}>T{player.tier} · #{player.rank}</span>
                {player.rfa_team && (
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: player.rfa_team === 'FRY' ? 'var(--fry)' : 'var(--orange)', border: '1px solid currentColor', padding: '1px 5px', borderRadius: 3 }}>
                    ROFR: {player.rfa_team}
                  </span>
                )}
                {(player.positions?.length > 0) && (
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)' }}>
                    {player.positions.join(' · ')}
                  </span>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: tColor, lineHeight: 1 }}>
                ${player.adj_value}M
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)' }}>ADJ VALUE</div>
              {player.oopsy_est_value != null && (
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--purple)', marginTop: 2 }}>
                  OOPSY ${player.oopsy_est_value}M
                </div>
              )}
            </div>
          </div>

          {/* Key stats */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {getKeyStats(player, type).map(([label, val]) => (
              <div key={label}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)', letterSpacing: 0.5 }}>{label}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'var(--text-dim)' }}>{val ?? '—'}</div>
              </div>
            ))}
          </div>

          {/* Smart tags */}
          {player.tags?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10 }}>
              {player.tags.map(tag => <TagPill key={tag} tag={tag} />)}
            </div>
          )}

          {/* Manual scouting note */}
          {player.note && (
            <div style={{
              marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 11,
              color: 'var(--text-dim)', lineHeight: 1.5,
              background: 'rgba(255,255,255,.03)', borderLeft: '2px solid var(--border2)',
              padding: '6px 10px', borderRadius: '0 4px 4px 0',
            }}>
              {player.note}
            </div>
          )}
        </div>
      )}

      {/* ── FRY signal bar ── */}
      {player && frySignal && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
          background: `${frySignal.color}14`, border: `1px solid ${frySignal.color}44`,
          borderRadius: 6, padding: '7px 12px',
        }}>
          <span style={{ fontSize: 14 }}>{frySignal.icon}</span>
          <div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: frySignal.color, letterSpacing: 1, fontWeight: 600 }}>{frySignal.label}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)' }}>{frySignal.note}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)' }}>FRY BUDGET</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: fry.budget_current < 20 ? 'var(--red)' : 'var(--text)' }}>
              ${Math.round(fry.budget_current ?? 0)}M
            </div>
          </div>
        </div>
      )}

      {/* ── Bid controls ── */}
      {player && (
        <div style={{ marginBottom: 12 }}>
          {/* Team selector */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1.5, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>Winning Team</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {TEAMS_LIST.map(t => {
                const td = teams[t] || {}
                const active = bidTeam === t
                const tc = TEAM_COLORS[t] || 'var(--text-dim)'
                return (
                  <button key={t} onClick={() => setBidTeam(t)} style={{
                    background: active ? `${tc}22` : 'var(--surface)',
                    border: `1px solid ${active ? tc : 'var(--border)'}`,
                    borderRadius: 4, padding: '4px 8px',
                    fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1,
                    color: active ? tc : 'var(--text-dim)', cursor: 'pointer',
                    position: 'relative',
                  }} title={`$${Math.round(td.budget_current ?? 0)}M left`}>
                    {t}
                    {t === 'FRY' && <span style={{ position: 'absolute', top: -3, right: -3, width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Bid stepper */}
          <BidStepper value={bidPrice} onChange={setBidPrice} maxBudget={bidTeamData?.budget_current} />

          {/* Price context */}
          {bidTeam && price > 0 && (
            <div style={{
              marginTop: 8, fontFamily: "'DM Mono', monospace", fontSize: 10,
              display: 'flex', gap: 16, flexWrap: 'wrap', color: 'var(--text-dim)',
            }}>
              <span>
                vs adj:{' '}
                <span style={{ color: over > 0 ? 'var(--red)' : over < 0 ? 'var(--green)' : 'var(--text)', fontWeight: 600 }}>
                  {over > 0 ? `+${over}M over` : over < 0 ? `${Math.abs(over)}M under` : 'at value'}
                </span>
              </span>
              <span>
                {bidTeam} budget:{' '}
                <span style={{ color: pctBudget > 50 ? 'var(--red)' : 'var(--text)' }}>{pctBudget}%</span>
              </span>
            </div>
          )}

          {/* Confirm button */}
          <button
            onClick={() => canConfirm && confirmSale()}
            disabled={!canConfirm}
            title={canConfirm ? 'Or press Enter' : undefined}
            style={{
              width: '100%', marginTop: 12, padding: '11px',
              background: canConfirm ? 'var(--accent)' : 'var(--surface2)',
              border: `1px solid ${canConfirm ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 6, cursor: canConfirm ? 'pointer' : 'not-allowed',
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 3,
              color: canConfirm ? '#0a0c10' : 'var(--muted)',
              transition: 'all .15s',
            }}
          >
            {canConfirm ? `✓ CONFIRM — ${bidTeam} GETS ${player.name} @ ${fmtPrice(bidPrice)}` : 'SELECT TEAM + PRICE TO CONFIRM'}
          </button>
        </div>
      )}

      {/* ── AI Intel ── */}
      {player && (
        <div style={{ marginTop: 4 }}>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1.5,
            color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ color: 'var(--blue)' }}>◈</span> AI INTEL
            {intel?.loading && <span style={{ color: 'var(--text-faint)', animation: 'pulse 1.2s infinite' }}>searching...</span>}
          </div>

          {intel?.loading && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 0' }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--blue)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-dim)' }}>
                Fetching latest news on {player.name}...
              </span>
            </div>
          )}

          {intel?.error && !intel.loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--red)', flex: 1 }}>
                ⚠ {intel.error}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIntel({ loading: true, text: null, error: null, player: player.name })
                  fetchPlayerIntel(player, type, apiKey, new AbortController().signal)
                    .then(text => setIntel({ loading: false, text, error: null, player: player.name }))
                    .catch(err => setIntel({ loading: false, text: null, error: err.message, player: player.name }))
                }}
                style={{ ...ghostBtn, padding: '4px 8px', fontSize: 9, borderColor: 'var(--blue)', color: 'var(--blue)' }}
              >
                RETRY
              </button>
            </div>
          )}

          {intel?.text && !intel.loading && (
            <div style={{
              background: 'rgba(56,189,248,.05)', border: '1px solid rgba(56,189,248,.15)',
              borderRadius: 6, padding: '10px 12px',
            }}>
              <IntelDisplay text={intel.text} />
            </div>
          )}

          {!intel && (
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-faint)', padding: '8px 0' }}>
              Nominate a player to load intel.
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!player && (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔨</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 3, color: 'var(--text-dim)', marginBottom: 6 }}>
            READY FOR AUCTION
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-faint)' }}>
            Search above or hit NOM in the player list
          </div>
        </div>
      )}

      {/* Reset modal */}
      {showReset && (
        <div role="dialog" aria-modal="true" aria-labelledby="reset-modal-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div ref={resetModalRef} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 28, maxWidth: 320, textAlign: 'center' }}>
            <div id="reset-modal-title" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: 'var(--red)', letterSpacing: 3, marginBottom: 10 }}>RESET AUCTION?</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 20 }}>Clears all sales and restores all budgets.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setShowReset(false)} style={ghostBtn}>CANCEL</button>
              <button onClick={() => { resetAuction(); setShowReset(false) }} style={{ ...ghostBtn, color: 'var(--red)', borderColor: 'var(--red)' }}>CONFIRM</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:.5 } 50% { opacity:1 } }
      `}</style>
    </div>
  )
}

// ── INTEL DISPLAY ─────────────────────────────────────────────────────────────
function IntelDisplay({ text }) {
  const lines = text.split('\n').filter(l => l.trim())
  const TAG_COLORS = {
    HEALTH: 'var(--green)', ROLE: 'var(--blue)',
    OUTLOOK: 'var(--t1)', CONTEXT: 'var(--text-dim)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lines.map((line, i) => {
        const isBullet = line.trim().startsWith('•')
        const clean = isBullet ? line.trim().replace(/^•\s*/, '') : line.trim()
        const tagMatch = clean.match(/^\[([A-Z]+)\]\s*(.*)/)
        const tag = tagMatch?.[1]
        const content = tagMatch ? tagMatch[2] : clean
        const tagColor = TAG_COLORS[tag] || 'var(--text-dim)'

        return (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {isBullet && <span style={{ color: 'var(--border2)', flexShrink: 0, marginTop: 1 }}>▸</span>}
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
              {tag && (
                <span style={{ color: tagColor, fontWeight: 600, marginRight: 5 }}>[{tag}]</span>
              )}
              {content}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── FRY SIGNAL ────────────────────────────────────────────────────────────────
function getFrySignal(player, fry, type) {
  const budget = fry.budget_current ?? 0
  const val = player.adj_value ?? 1
  const pct = budget > 0 ? val / budget : 0
  const posType = type || (player.pa !== undefined ? 'BAT' : player.gs !== undefined ? 'SP' : 'RP')

  if (budget <= 0) return { label: 'PASS', color: 'var(--muted)', icon: '—', note: 'Budget exhausted' }
  if (pct > 0.5) return { label: 'RISKY', color: 'var(--red)', icon: '⚠', note: `${Math.round(pct*100)}% of remaining budget` }
  if (pct > 0.35) return { label: 'STRETCH', color: 'var(--orange)', icon: '↑', note: `${Math.round(pct*100)}% of remaining budget` }

  if (FRY_NEEDS.critical.includes(posType) && player.tier <= 2)
    return { label: 'MUST BID', color: 'var(--fry)', icon: '🎯', note: `Critical need · T${player.tier}` }
  if (FRY_NEEDS.critical.includes(posType))
    return { label: 'FILL NEED', color: 'var(--green)', icon: '★', note: `FRY needs ${posType}` }

  const neededFill = (player.positions ?? []).filter(pos => FRY_NEEDS.needed.includes(pos))
  if (neededFill.length > 0 && player.tier <= 2)
    return { label: 'WANTED', color: 'var(--blue)', icon: '◎', note: `Fills ${neededFill.join('/')}` }

  if (player.tier === 1) return { label: 'ELITE', color: 'var(--t1)', icon: '⚡', note: 'Top tier — bid aggressively' }
  if (player.tier === 2) return { label: 'TARGET', color: 'var(--t2)', icon: '◎', note: 'Premium — budget accordingly' }
  if (pct < 0.03) return { label: 'ENDGAME', color: 'var(--text-dim)', icon: '$1', note: '$1–3M range' }
  return { label: 'WATCH', color: 'var(--text-faint)', icon: '·', note: 'Monitor — no urgent signal' }
}

// ── TAG PILL ──────────────────────────────────────────────────────────────────
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
  ADP_VALUE:    { bg: 'rgba(74,222,128,.12)',  color: 'var(--green)',   text: 'ADP VALUE' },
  ADP_AVOID:    { bg: 'rgba(248,113,113,.12)', color: 'var(--red)',     text: 'ADP AVOID' },
  SP_LOCKED:    { bg: 'rgba(56,189,248,.12)',  color: 'var(--blue)',    text: 'ROLE LOCKED' },
}

function TagPill({ tag }) {
  const cfg = TAG_CONFIG[tag] || { bg: 'rgba(148,163,184,.10)', color: 'var(--muted)', text: tag }
  return (
    <span style={{
      display: 'inline-block',
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}55`,
      borderRadius: 3, padding: '3px 8px',
      fontFamily: "'DM Mono', monospace", fontSize: 9,
      letterSpacing: 0.6, fontWeight: 600, textTransform: 'uppercase',
    }}>
      {cfg.text}
    </span>
  )
}

// ── TYPE BADGE ────────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const colors = { BAT: ['rgba(200,241,53,.12)', 'var(--t1)'], SP: ['rgba(56,189,248,.12)', 'var(--blue)'], RP: ['rgba(251,146,60,.12)', 'var(--orange)'] }
  const [bg, color] = colors[type] || ['transparent', 'var(--text-dim)']
  return (
    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, background: bg, color, padding: '1px 6px', borderRadius: 3 }}>
      {type}
    </span>
  )
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const ghostBtn = {
  background: 'none', border: '1px solid var(--border2)', borderRadius: 4,
  padding: '4px 10px', fontFamily: "'DM Mono', monospace", fontSize: 10,
  color: 'var(--text-dim)', cursor: 'pointer',
}
const stepBtn = {
  background: 'var(--surface2)', border: '1px solid var(--border2)',
  padding: '8px 16px', cursor: 'pointer',
  color: 'var(--text)', fontFamily: "'DM Mono', monospace",
  fontSize: 20, lineHeight: 1, transition: 'background .1s',
}
