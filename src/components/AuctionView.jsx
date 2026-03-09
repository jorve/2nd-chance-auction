import { useState, useRef, useEffect } from 'react'
import { useAuctionStore, TEAMS_LIST, TEAM_COLORS, stepUp, stepDown, isValidBidPrice, fmtPrice, snapToValidIncrement } from '../store/auctionStore.jsx'

// ── HELPERS ───────────────────────────────────────────────────────────────────
function getPlayerType(p) {
  if (p.pa !== undefined) return 'BAT'
  if (p.gs !== undefined) return 'SP'
  return 'RP'
}

function getKeyStats(p, type) {
  if (type === 'BAT') return [['OPS', p.ops?.toFixed(3)], ['HR', p.hr], ['aSB', p.asb]]
  if (type === 'SP')  return [['ERA', p.era?.toFixed(2)], ['K', p.k], ['IP', p.ip]]
  return [['SV', p.sv], ['HLD', p.hld], ['VIJAY', p.vijay?.toFixed(1)]]
}

// Flag any results that share a last name with another result
function flagAmbiguous(results) {
  const lastNames = results.map(p => p.name.split(' ').slice(-1)[0].toLowerCase())
  return results.map((_, i) => {
    const ln = lastNames[i]
    return lastNames.filter(n => n === ln).length > 1
  })
}

// ── BID STEPPER ───────────────────────────────────────────────────────────────
function BidStepper({ value, onChange, maxBudget }) {
  const [inputMode, setInputMode] = useState(false)
  const [rawInput, setRawInput] = useState('')
  const inputRef = useRef()

  useEffect(() => {
    if (inputMode && inputRef.current) inputRef.current.select()
  }, [inputMode])

  const n = parseFloat(value) || 0
  const isValid = isValidBidPrice(value)
  const isOver = maxBudget > 0 && n > maxBudget
  const display = n % 1 === 0 ? `${n}` : `${n.toFixed(1)}`

  function commitRaw() {
    const snapped = snapToValidIncrement(parseFloat(rawInput) || 0.5)
    onChange(snapped)
    setInputMode(false)
  }

  return (
    <div>
      <label style={labelStyle}>FINAL PRICE ($M)</label>

      {/* Stepper row */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <button
          onClick={() => onChange(stepDown(value))}
          disabled={n <= 0.5}
          style={{ ...stepBtnBase, borderRadius: '6px 0 0 6px', opacity: n <= 0.5 ? 0.3 : 1 }}
        >−</button>

        {inputMode ? (
          <input
            ref={inputRef}
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            onBlur={commitRaw}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRaw()
              if (e.key === 'Escape') setInputMode(false)
              if (e.key === 'ArrowUp') { e.preventDefault(); onChange(stepUp(value)) }
              if (e.key === 'ArrowDown') { e.preventDefault(); onChange(stepDown(value)) }
            }}
            style={{
              flex: 1, textAlign: 'center', minWidth: 0,
              background: 'var(--surface2)',
              border: '1px solid var(--accent)', borderLeft: 'none', borderRight: 'none',
              color: 'var(--accent)',
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2,
              outline: 'none',
            }}
          />
        ) : (
          <button
            onClick={() => { setRawInput(display); setInputMode(true) }}
            onKeyDown={e => {
              if (e.key === 'ArrowUp') { e.preventDefault(); onChange(stepUp(value)) }
              if (e.key === 'ArrowDown') { e.preventDefault(); onChange(stepDown(value)) }
            }}
            title="Click to type exact value · ↑↓ to step"
            style={{
              flex: 1, textAlign: 'center', minWidth: 0,
              background: 'var(--surface2)',
              border: `1px solid ${isOver ? 'var(--red)' : isValid ? 'var(--border2)' : 'var(--orange)'}`,
              borderLeft: 'none', borderRight: 'none',
              color: isOver ? 'var(--red)' : isValid ? 'var(--text)' : 'var(--orange)',
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2,
              cursor: 'text', padding: '10px 0',
              transition: 'border-color .15s, color .15s',
            }}
          >
            ${display}M
          </button>
        )}

        <button
          onClick={() => onChange(stepUp(value))}
          style={{ ...stepBtnBase, borderRadius: '0 6px 6px 0' }}
        >+</button>
      </div>

      {/* Increment hint */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 5,
        fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)',
      }}>
        <span>Click value to type · ↑↓ to step</span>
        <span style={{ color: n < 10 ? 'var(--blue)' : 'var(--text-faint)' }}>
          {n < 10 ? '$0.5M steps ≤ $10M' : '$1M steps > $10M'}
        </span>
      </div>

      {/* Quick amounts */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        {[0.5, 1, 2, 5, 10, 15, 20, 25, 30, 40].map(q => (
          <button key={q} onClick={() => onChange(q)} style={{
            background: n === q ? 'var(--accent)' : 'var(--surface)',
            border: `1px solid ${n === q ? 'var(--accent)' : 'var(--border2)'}`,
            borderRadius: 4, padding: '3px 8px',
            fontFamily: "'DM Mono', monospace", fontSize: 10,
            color: n === q ? '#000' : 'var(--text-dim)',
            cursor: 'pointer', transition: 'all .1s',
          }}>${q}</button>
        ))}
      </div>

      {/* Over-budget warning */}
      {isOver && (
        <div style={{ marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--red)' }}>
          ⚠ Exceeds remaining budget (${maxBudget?.toFixed(1)}M)
        </div>
      )}
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function AuctionView() {
  const {
    batters, sp, rp, sold,
    nominatedPlayer, setNominatedPlayer,
    bidTeam, setBidTeam,
    bidPrice, setBidPrice,
    confirmSale, undoLastSale,
    auctionLog, teams, resetAuction,
    setActiveTab, setRankingsTab,
  } = useAuctionStore()

  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const searchWrapRef = useRef()

  // Pool already excludes draft-board keepers + AA players (filtered at data-gen time)
  const allPlayers = [...batters, ...sp, ...rp].filter(p => !sold[p.name])

  // Search: match on name, rank by position of match
  const searchResults = search.trim().length >= 2
    ? allPlayers
        .filter(p => p.name.toLowerCase().includes(search.toLowerCase().trim()))
        .sort((a, b) => {
          const q = search.toLowerCase()
          return a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q)
        })
        .slice(0, 10)
    : []

  const ambiguous = flagAmbiguous(searchResults)
  const showDropdown = searchFocused && search.trim().length >= 2

  const fry = teams['FRY'] || {}
  const bidTeamData = bidTeam ? teams[bidTeam] : null
  const price = parseFloat(bidPrice) || 0
  const canConfirm = (
    nominatedPlayer &&
    bidTeam &&
    isValidBidPrice(bidPrice) &&
    price <= (bidTeamData?.budget_current ?? Infinity)
  )

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', minHeight: 'calc(100vh - 130px)' }}>

      {/* ── LEFT: NOMINATION + SALE ── */}
      <div style={{ padding: 24, borderRight: '1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3 }}>
            NOMINATE + SELL
          </h2>
          {auctionLog.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={undoLastSale} style={ghostBtn}>↩ UNDO LAST</button>
              <button onClick={() => setShowReset(true)} style={{ ...ghostBtn, color: 'var(--red)', borderColor: 'var(--red)' }}>RESET</button>
            </div>
          )}
        </div>

        {/* Player search with disambiguation dropdown */}
        <div style={{ marginBottom: 20, position: 'relative' }} ref={searchWrapRef}>
          <label style={labelStyle}>
            SEARCH AVAILABLE PLAYERS
            <span style={{ color: 'var(--text-faint)', marginLeft: 8 }}>({allPlayers.length} in pool)</span>
          </label>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setSearchFocused(true) }}
            onFocus={() => setSearchFocused(true)}
            placeholder="Type player name..."
            style={{
              width: '100%', background: 'var(--surface)',
              border: `1px solid ${searchFocused ? 'var(--accent)' : 'var(--border2)'}`,
              borderRadius: showDropdown && searchResults.length > 0 ? '6px 6px 0 0' : 6,
              padding: '10px 14px', color: 'var(--text)',
              fontFamily: "'DM Mono', monospace", fontSize: 13, outline: 'none',
              transition: 'border-color .15s',
            }}
          />

          {/* Results dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
              background: 'var(--surface)', border: '1px solid var(--accent)',
              borderTop: 'none', borderRadius: '0 0 8px 8px',
              boxShadow: '0 12px 32px rgba(0,0,0,.6)',
              maxHeight: 440, overflowY: 'auto',
            }}>
              {searchResults.map((p, idx) => {
                const type = getPlayerType(p)
                const keyStats = getKeyStats(p, type)
                const isAmb = ambiguous[idx]
                const tierColor = { 1:'var(--t1)', 2:'var(--t2)', 3:'var(--t3)', 4:'var(--t4)', 5:'var(--t5)' }[p.tier] || 'var(--t5)'

                return (
                  <button
                    key={`${p.name}_${p.team}_${idx}`}
                    onMouseDown={e => {
                      e.preventDefault()
                      setNominatedPlayer(p)
                      setSearch('')
                      setSearchFocused(false)
                    }}
                    style={{
                      display: 'block', width: '100%',
                      background: 'none', border: 'none',
                      padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* Tier pip */}
                      <span style={{
                        flexShrink: 0, width: 7, height: 7, borderRadius: '50%',
                        background: tierColor, display: 'inline-block',
                        boxShadow: p.tier === 1 ? `0 0 5px ${tierColor}` : 'none',
                      }} />

                      {/* Name + tags */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 500 }}>{p.name}</span>
                          {isAmb && (
                            <span style={{
                              fontFamily: "'DM Mono', monospace", fontSize: 9,
                              background: 'rgba(251,146,60,.15)', color: 'var(--orange)',
                              border: '1px solid var(--orange)', padding: '1px 5px', borderRadius: 3,
                            }}>SIMILAR NAME</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 7, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                          {/* MLB team — primary disambiguation */}
                          <span style={{
                            fontFamily: "'DM Mono', monospace", fontSize: 11,
                            color: 'var(--text)', fontWeight: 600,
                          }}>{p.team || 'FA'}</span>
                          {/* Type */}
                          <span style={{
                            fontFamily: "'DM Mono', monospace", fontSize: 9,
                            background: type === 'BAT' ? 'rgba(200,241,53,.12)' : type === 'SP' ? 'rgba(56,189,248,.12)' : 'rgba(251,146,60,.12)',
                            color: type === 'BAT' ? 'var(--t1)' : type === 'SP' ? 'var(--blue)' : 'var(--orange)',
                            padding: '1px 5px', borderRadius: 3,
                          }}>{type}</span>
                          {/* Rank */}
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)' }}>
                            #{p.rank} T{p.tier}
                          </span>
                          {/* ROFR */}
                          {p.rfa_team && (
                            <span style={{
                              fontFamily: "'DM Mono', monospace", fontSize: 9,
                              color: p.rfa_team === 'FRY' ? 'var(--fry)' : 'var(--orange)',
                              border: '1px solid currentColor', padding: '1px 5px', borderRadius: 3,
                            }}>ROFR:{p.rfa_team}</span>
                          )}
                        </div>
                      </div>

                      {/* Key stats — help tell similar players apart */}
                      <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                        {keyStats.map(([lbl, val]) => (
                          <div key={lbl} style={{ textAlign: 'center', minWidth: 30 }}>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)', letterSpacing: 0.5 }}>{lbl}</div>
                            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-dim)' }}>{val ?? '—'}</div>
                          </div>
                        ))}
                      </div>

                      {/* Adj value */}
                      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 55 }}>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: tierColor, lineHeight: 1 }}>
                          ${p.adj_value}M
                        </div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)' }}>adj</div>
                      </div>
                    </div>
                  </button>
                )
              })}

              <div style={{
                padding: '7px 14px', fontFamily: "'DM Mono', monospace", fontSize: 9,
                color: 'var(--text-faint)', borderTop: '1px solid var(--border)',
              }}>
                Showing {searchResults.length} of {allPlayers.length} available · owned/AA players excluded
              </div>
            </div>
          )}

          {/* No results */}
          {showDropdown && search.trim().length >= 2 && searchResults.length === 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
              background: 'var(--surface)', border: '1px solid var(--border2)',
              borderTop: 'none', borderRadius: '0 0 8px 8px',
              padding: '14px', fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-dim)',
            }}>
              No match for "{search.trim()}" — player may already be owned or in AA.
            </div>
          )}
        </div>

        {/* Nominated player card */}
        {nominatedPlayer ? (
          <PlayerCard player={nominatedPlayer} onClear={() => setNominatedPlayer(null)} />
        ) : (
          <div style={{ border: '1px dashed var(--border2)', borderRadius: 8, padding: 24, textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.9 }}>
              Search above · or click{' '}
              <span
                style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => { setActiveTab('rankings'); setRankingsTab('batters') }}
              >NOM →</span>
              {' '}from Rankings
            </div>
          </div>
        )}

        {/* Sale form */}
        {nominatedPlayer && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border2)',
            borderRadius: 8, padding: 20, marginBottom: 20,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>

              {/* Team selector */}
              <div>
                <label style={labelStyle}>WINNING TEAM</label>
                <select
                  value={bidTeam}
                  onChange={e => setBidTeam(e.target.value)}
                  style={{
                    width: '100%', background: 'var(--surface2)', border: '1px solid var(--border2)',
                    borderRadius: 6, padding: '10px 12px',
                    color: bidTeam ? 'var(--text)' : 'var(--text-dim)',
                    fontFamily: "'DM Mono', monospace", fontSize: 13, outline: 'none',
                  }}
                >
                  <option value="">Select team...</option>
                  {TEAMS_LIST.map(t => {
                    const td = teams[t] || {}
                    return (
                      <option key={t} value={t}>
                        {t} · ${td.budget_current?.toFixed(1)}M · {td.slots_current} slots
                      </option>
                    )
                  })}
                </select>

                {/* Mini budget bar */}
                {bidTeamData && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        width: `${Math.min(100, (bidTeamData.budget_current / (bidTeamData.budget_initial || 213)) * 100)}%`,
                        background: bidTeamData.budget_current < 20 ? 'var(--red)' : 'var(--green)',
                        transition: 'width .3s',
                      }} />
                    </div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)', marginTop: 3 }}>
                      ${bidTeamData.budget_current?.toFixed(1)}M left · {bidTeamData.slots_current} slots
                    </div>
                  </div>
                )}
              </div>

              {/* Bid stepper */}
              <BidStepper
                value={bidPrice}
                onChange={setBidPrice}
                maxBudget={bidTeamData?.budget_current}
              />
            </div>

            {/* Price context */}
            {bidTeam && bidPrice && (
              <PriceContext player={nominatedPlayer} teamData={bidTeamData} price={price} />
            )}

            {/* Confirm button */}
            <button
              onClick={confirmSale}
              disabled={!canConfirm}
              style={{
                width: '100%', padding: '14px',
                background: canConfirm ? 'var(--accent)' : 'var(--border)',
                border: 'none', borderRadius: 6,
                fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2,
                color: canConfirm ? '#000' : 'var(--text-dim)',
                cursor: canConfirm ? 'pointer' : 'not-allowed',
                transition: 'all .15s',
              }}
            >
              {canConfirm
                ? `SELL ${nominatedPlayer.name.split(' ').slice(-1)[0].toUpperCase()} → ${bidTeam} · ${fmtPrice(bidPrice)}`
                : 'SELECT TEAM + VALID PRICE'}
            </button>
          </div>
        )}

        {/* Recent sales preview */}
        {auctionLog.length > 0 && (
          <div>
            <div style={{ ...labelStyle, marginBottom: 8 }}>RECENT SALES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {auctionLog.slice(0, 5).map((entry, i) => (
                <LogEntry key={entry.ts} entry={entry} latest={i === 0} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: FULL AUCTION LOG ── */}
      <div style={{ padding: 24, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3 }}>
            AUCTION LOG
          </h2>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-dim)', textAlign: 'right' }}>
            <div>{auctionLog.length} sold</div>
            <div>{fmtPrice(auctionLog.reduce((s, e) => s + e.price, 0))} spent</div>
          </div>
        </div>

        {auctionLog.length === 0 ? (
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', marginTop: 60 }}>
            No sales yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
            {auctionLog.map((entry, i) => (
              <LogEntry key={entry.ts} entry={entry} latest={i === 0} expanded />
            ))}
          </div>
        )}
      </div>

      {/* ── RESET MODAL ── */}
      {showReset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 12, padding: 32, maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: 'var(--red)', letterSpacing: 3, marginBottom: 12 }}>RESET AUCTION?</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 24 }}>
              Clear all {auctionLog.length} sales and restore all budgets?
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={() => setShowReset(false)} style={ghostBtn}>CANCEL</button>
              <button onClick={() => { resetAuction(); setShowReset(false) }} style={{ ...ghostBtn, color: 'var(--red)', borderColor: 'var(--red)' }}>CONFIRM</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PLAYER CARD ───────────────────────────────────────────────────────────────
function PlayerCard({ player, onClear }) {
  const tierColors = { 1:'var(--t1)', 2:'var(--t2)', 3:'var(--t3)', 4:'var(--t4)', 5:'var(--t5)' }
  const tColor = tierColors[player.tier] || 'var(--text-dim)'
  const type = getPlayerType(player)
  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${tColor}44`,
      borderRadius: 8, padding: '14px 18px', marginBottom: 16,
      boxShadow: `0 0 24px ${tColor}10`, position: 'relative',
    }}>
      <button onClick={onClear} style={{
        position: 'absolute', top: 10, right: 12,
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 14, color: 'var(--text-faint)', padding: 4,
      }}>✕</button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ paddingRight: 28 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 5 }}>{player.name}</div>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{player.team || 'FA'}</span>
            <span style={{
              fontFamily: "'DM Mono', monospace", fontSize: 9,
              background: type === 'BAT' ? 'rgba(200,241,53,.12)' : type === 'SP' ? 'rgba(56,189,248,.12)' : 'rgba(251,146,60,.12)',
              color: type === 'BAT' ? 'var(--t1)' : type === 'SP' ? 'var(--blue)' : 'var(--orange)',
              padding: '1px 6px', borderRadius: 3,
            }}>{type}</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: tColor }}>T{player.tier} · #{player.rank}</span>
            {player.rfa_team && (
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 9,
                color: player.rfa_team === 'FRY' ? 'var(--fry)' : 'var(--orange)',
                border: '1px solid currentColor', padding: '1px 5px', borderRadius: 3,
              }}>ROFR: {player.rfa_team}</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: tColor, lineHeight: 1 }}>
            ${player.adj_value}M
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)' }}>ADJ VALUE</div>
          {player.oopsy_est_value != null && (
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--purple)', marginTop: 2 }}>
              OOPSY ${player.oopsy_est_value}M
            </div>
          )}
        </div>
      </div>
      <MiniStats player={player} type={type} />
    </div>
  )
}

function MiniStats({ player, type }) {
  let stats = []
  if (type === 'BAT') stats = [['HR',player.hr],['R',player.r],['OBP',player.obp?.toFixed(3)],['OPS',player.ops?.toFixed(3)],['aSB',player.asb],['wRC+',player.wrc_plus],['WAR',player.war?.toFixed(1)]]
  else if (type === 'SP') stats = [['GS',player.gs],['IP',player.ip],['K',player.k],['ERA',player.era?.toFixed(2)],['WHIP',player.whip?.toFixed(3)],['MGS',Math.round(player.mgs)],['WAR',player.war?.toFixed(1)]]
  else stats = [['IP',player.ip],['SV',player.sv],['HLD',player.hld],['K',player.k],['ERA',player.era?.toFixed(2)],['VIJAY',player.vijay?.toFixed(1)],['WAR',player.war?.toFixed(1)]]
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {stats.map(([label, val]) => (
        <div key={label}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'var(--text-faint)', letterSpacing: 0.5 }}>{label}</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'var(--text-dim)' }}>{val ?? '—'}</div>
        </div>
      ))}
    </div>
  )
}

// ── PRICE CONTEXT ─────────────────────────────────────────────────────────────
function PriceContext({ player, teamData, price }) {
  if (!teamData || !price) return null
  const over = parseFloat((price - player.adj_value).toFixed(1))
  const pct = teamData.budget_current > 0 ? ((price / teamData.budget_current) * 100).toFixed(0) : 0
  return (
    <div style={{
      background: 'var(--surface2)', borderRadius: 6, padding: '9px 14px',
      marginBottom: 14, fontFamily: "'DM Mono', monospace", fontSize: 11,
      display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
    }}>
      <div>
        <span style={{ color: 'var(--text-dim)' }}>vs adj value: </span>
        <span style={{ color: over > 0 ? 'var(--red)' : over < 0 ? 'var(--green)' : 'var(--text)', fontWeight: 600 }}>
          {over > 0 ? `+${over}M OVER` : over < 0 ? `${over}M UNDER` : 'AT VALUE'}
        </span>
      </div>
      <div>
        <span style={{ color: 'var(--text-dim)' }}>{teamData.abbr || ''} budget: </span>
        <span style={{ color: pct > 50 ? 'var(--red)' : 'var(--text)' }}>{pct}%</span>
      </div>
      {player.oopsy_est_value != null && (
        <div>
          <span style={{ color: 'var(--text-dim)' }}>OOPSY: </span>
          <span style={{ color: 'var(--purple)' }}>${player.oopsy_est_value}M</span>
        </div>
      )}
    </div>
  )
}

// ── LOG ENTRY ─────────────────────────────────────────────────────────────────
function LogEntry({ entry, latest, expanded }) {
  const teamColor = TEAM_COLORS[entry.team] || 'var(--text-dim)'
  const over = parseFloat((entry.price - (entry.est_value || entry.price)).toFixed(1))
  const priceStr = entry.price % 1 === 0 ? `$${entry.price}M` : `$${entry.price.toFixed(1)}M`
  return (
    <div style={{
      background: latest ? 'rgba(200,241,53,.05)' : 'transparent',
      border: `1px solid ${latest ? 'var(--accent)33' : 'var(--border)'}`,
      borderRadius: 6, padding: expanded ? '10px 14px' : '7px 12px',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, color: teamColor, minWidth: 48, letterSpacing: 1 }}>
        {entry.team}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entry.playerName}
        </div>
        {expanded && (
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
            {entry.team_mlb} · {entry.pos_type?.toUpperCase()} · #{entry.rank}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, lineHeight: 1 }}>{priceStr}</div>
        {expanded && over !== 0 && (
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: over > 0 ? 'var(--red)' : 'var(--green)' }}>
            {over > 0 ? `+${over}` : `${over}`}M
          </div>
        )}
      </div>
    </div>
  )
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const labelStyle = {
  display: 'block', marginBottom: 6,
  fontFamily: "'DM Mono', monospace", fontSize: 10,
  letterSpacing: 1.5, color: 'var(--text-dim)', textTransform: 'uppercase',
}
const ghostBtn = {
  background: 'none', border: '1px solid var(--border2)',
  borderRadius: 4, padding: '6px 14px',
  fontFamily: "'DM Mono', monospace", fontSize: 11,
  color: 'var(--text-dim)', cursor: 'pointer',
}
const stepBtnBase = {
  background: 'var(--surface2)', border: '1px solid var(--border2)',
  padding: '10px 18px', cursor: 'pointer',
  color: 'var(--text)', fontFamily: "'DM Mono', monospace",
  fontSize: 22, lineHeight: 1, transition: 'background .1s',
}
