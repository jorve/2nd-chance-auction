import { useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowDown,
  faArrowUp,
  faClipboardList,
  faFloppyDisk,
  faKey,
  faLandmark,
  faListOl,
  faRotateLeft,
  faToggleOff,
  faToggleOn,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { useApiKeyStore } from '../store/apiKeyStore.js'
import { useAuctionStore, exportAuctionJSON, importAuctionJSON, MY_TEAM_ABBR } from '../store/auctionStore.jsx'
import AuctionLogView from './AuctionLogView.jsx'
import {
  BATTING_CATEGORIES,
  PITCHING_CATEGORIES,
  LEAGUE_SCORING_SHORT,
  LEAGUE_FORMAT_LINE,
  LEAGUE_LINEUP_LINE,
} from '../config/leagueScoring.js'

export default function Header({ onLeagueClick }) {
  const [showAuctionLog, setShowAuctionLog] = useState(false)
  const [showScoring, setShowScoring] = useState(false)
  const { teams, sold, fryLens, toggleFryLens, riskAdj, toggleRiskAdj, auctionLog, undoLastSale, restoreFromSnapshot } = useAuctionStore(useShallow((s) => ({
    teams: s.teams,
    sold: s.sold,
    fryLens: s.fryLens,
    toggleFryLens: s.toggleFryLens,
    riskAdj: s.riskAdj,
    toggleRiskAdj: s.toggleRiskAdj,
    auctionLog: s.auctionLog,
    undoLastSale: s.undoLastSale,
    restoreFromSnapshot: s.restoreFromSnapshot,
  })))
  const fry = teams[MY_TEAM_ABBR] || {}
  const totalPot = Object.values(teams).reduce((s, t) => s + t.budget_current, 0)
  const soldCount = Object.keys(sold).length
  const budgetColor = fry.budget_current < 20 ? 'var(--red)' : fry.budget_current < 40 ? 'var(--orange)' : 'var(--accent)'
  const { apiKey, setApiKey } = useApiKeyStore()
  const [editingKey, setEditingKey] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const keyInputRef = useRef()
  const importRef = useRef()
  const [importMsg, setImportMsg] = useState(null)

  function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    importAuctionJSON(file)
      .then(snapshot => {
        restoreFromSnapshot(snapshot)
        const n = Object.keys(snapshot.sold).length
        setImportMsg({ ok: true, text: `Restored ${n} picks` })
        setTimeout(() => setImportMsg(null), 3000)
      })
      .catch(err => {
        setImportMsg({ ok: false, text: `${err.message}` })
        setTimeout(() => setImportMsg(null), 4000)
      })
    e.target.value = ''
  }

  const iconBtn = {
    background: 'var(--surface2)', border: '1px solid var(--border2)',
    borderRadius: 5, padding: '6px 12px',
    fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 1,
    color: 'var(--text-dim)', cursor: 'pointer', transition: 'all .15s',
    display: 'flex', alignItems: 'center', gap: 5,
  }

  return (
    <header style={{
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      {/* Logo */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 4, color: 'var(--accent)', lineHeight: 1 }}>LDB 2026</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 1 }}>SNAKE DRAFT + BOARD</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: 1, color: 'var(--text-dim)', marginTop: 4 }}>{LEAGUE_FORMAT_LINE}</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: 0.5, color: 'var(--text-faint)', marginTop: 2, maxWidth: 320 }} title="Lineups lock for the scoring week — not daily FAAB streaming">
          {LEAGUE_LINEUP_LINE}
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: 0.5, color: 'var(--text-faint)', marginTop: 3, maxWidth: 300 }} title="Category list — open SCORING for full names">
          {LEAGUE_SCORING_SHORT}
        </div>
      </div>

      <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

      {/* My squad budget (see MY_TEAM_ABBR in config) */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1.5, color: 'var(--text-dim)', marginBottom: 2 }}>MY BUDGET</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: budgetColor, lineHeight: 1 }}>
            ${Math.round(fry.budget_current ?? 0)}M
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-dim)' }}>
            · {fry.slots_current ?? 0} slots
          </span>
        </div>
      </div>

      <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

      {/* Pool + sold */}
      <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
        <StatChip label="POOL" value={`$${Math.round(totalPot)}M`} />
        <StatChip label="SOLD" value={soldCount} dim />
      </div>

      <div style={{ flex: 1 }} />

      {/* Save indicator */}
      <div style={{
        fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 0.5,
        color: soldCount > 0 ? 'var(--green)' : 'var(--text-faint)',
        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
      }}>
        {soldCount > 0 ? (
          <>
            <FontAwesomeIcon icon={faFloppyDisk} />
            <span>AUTO-SAVED</span>
          </>
        ) : <span style={{ color: 'var(--text-faint)' }}>no picks yet</span>}
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* Export */}
      <button
        onClick={exportAuctionJSON}
        disabled={soldCount === 0}
        style={{ ...iconBtn, opacity: soldCount === 0 ? 0.4 : 1 }}
        title="Download draft snapshot as JSON"
        onMouseEnter={e => { if (soldCount > 0) { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
      >
        <FontAwesomeIcon icon={faArrowDown} />
        EXPORT
      </button>

      {/* Import */}
      <button
        onClick={() => importRef.current?.click()}
        style={iconBtn}
        title="Load a previously exported draft JSON"
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
      >
        <FontAwesomeIcon icon={faArrowUp} />
        IMPORT
      </button>
      <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />

      {/* Import feedback toast */}
      {importMsg && (
        <span style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10,
          color: importMsg.ok ? 'var(--green)' : 'var(--red)',
          flexShrink: 0,
        }}>{importMsg.text}</span>
      )}

      <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* Undo */}
      {auctionLog.length > 0 && (
        <button
          onClick={undoLastSale}
          title="Undo last pick"
          style={iconBtn}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--orange)'; e.currentTarget.style.color = 'var(--orange)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
        >
          <FontAwesomeIcon icon={faRotateLeft} />
          UNDO LAST
          <span style={{ background: 'var(--border2)', borderRadius: 8, padding: '1px 6px', fontSize: 9 }}>
            {auctionLog.length}
          </span>
        </button>
      )}

      {/* Auction log */}
      <button
        onClick={() => setShowAuctionLog(true)}
        disabled={auctionLog.length === 0}
        style={{
          ...iconBtn,
          opacity: auctionLog.length === 0 ? 0.4 : 1,
        }}
        title="View full draft log with bargains/overpays"
        onMouseEnter={e => { if (auctionLog.length > 0) { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)' }}}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
      >
        <FontAwesomeIcon icon={faClipboardList} />
        LOG
      </button>

      {/* Scoring reference */}
      <button
        type="button"
        onClick={() => setShowScoring(true)}
        title="Season-long roto categories (not H2H)"
        style={{
          background: 'var(--surface2)', border: '1px solid var(--border2)',
          borderRadius: 5, padding: '6px 12px',
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 2,
          color: 'var(--text-dim)', cursor: 'pointer', transition: 'all .15s',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
      >
        <FontAwesomeIcon icon={faListOl} />
        &nbsp;SCORING
      </button>

      {/* League board */}
      <button onClick={onLeagueClick} style={{
        background: 'var(--surface2)', border: '1px solid var(--border2)',
        borderRadius: 5, padding: '6px 14px',
        fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 2,
        color: 'var(--text-dim)', cursor: 'pointer', transition: 'all .15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
      >
        <FontAwesomeIcon icon={faLandmark} />
        &nbsp;LEAGUE BOARD
      </button>

      {/* Squad need lens */}
      <button onClick={toggleFryLens} style={{
        background: fryLens ? 'var(--accent)' : 'var(--surface2)',
        border: `1px solid ${fryLens ? 'var(--accent)' : 'var(--border2)'}`,
        color: fryLens ? '#0a0c10' : 'var(--text-dim)',
        borderRadius: 5, padding: '6px 14px',
        fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 2,
        transition: 'all .2s', cursor: 'pointer',
      }}>
        <FontAwesomeIcon icon={fryLens ? faToggleOn : faToggleOff} />
        &nbsp;{fryLens ? 'LENS ON' : 'NEEDS LENS'}
      </button>

      {/* Risk-adjusted valuation toggle */}
      <button
        onClick={toggleRiskAdj}
        title="Runtime risk-adjusted valuation: applies VOL MULT to positive VORP only (high-vol discounts, low-vol premiums)."
        style={{
          background: riskAdj ? 'rgba(251,146,60,.15)' : 'var(--surface2)',
          border: `1px solid ${riskAdj ? 'var(--orange)' : 'var(--border2)'}`,
          color: riskAdj ? 'var(--orange)' : 'var(--text-dim)',
          borderRadius: 5, padding: '6px 14px',
          fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 2,
          transition: 'all .2s', cursor: 'pointer',
        }}
      >
        <FontAwesomeIcon icon={riskAdj ? faToggleOn : faToggleOff} />
        &nbsp;{riskAdj ? 'RISK ADJ ON' : 'RISK ADJ'}
      </button>

      <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* ── API Key widget ── */}
      {!editingKey ? (
        <button
          onClick={() => { setKeyDraft(apiKey); setEditingKey(true); setTimeout(() => keyInputRef.current?.focus(), 30) }}
          title={apiKey ? 'Anthropic API key set — click to change' : 'Set your Anthropic API key to enable AI Intel'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: apiKey ? 'rgba(74,222,128,.08)' : 'rgba(239,68,68,.08)',
            border: `1px solid ${apiKey ? 'rgba(74,222,128,.35)' : 'rgba(239,68,68,.45)'}`,
            borderRadius: 5, padding: '5px 12px', cursor: 'pointer',
            fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: 0.5,
            color: apiKey ? 'var(--green)' : '#f87171',
            flexShrink: 0, transition: 'all .15s',
          }}
        >
          <span style={{ fontSize: 11 }}>
            <FontAwesomeIcon icon={apiKey ? faKey : faTriangleExclamation} />
          </span>
          <span>{apiKey ? 'API KEY SET' : 'SET API KEY'}</span>
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <input
            ref={keyInputRef}
            type="password"
            value={keyDraft}
            onChange={e => setKeyDraft(e.target.value)}
            placeholder="sk-ant-api03-..."
            onKeyDown={e => {
              if (e.key === 'Enter') { setApiKey(keyDraft); setEditingKey(false) }
              if (e.key === 'Escape') setEditingKey(false)
            }}
            style={{
              width: 220, background: 'var(--surface)', color: 'var(--text)',
              border: '1px solid var(--accent)', borderRadius: 4,
              padding: '5px 10px', fontFamily: "'DM Mono', monospace",
              fontSize: 11, outline: 'none',
            }}
          />
          <button
            onClick={() => { setApiKey(keyDraft); setEditingKey(false) }}
            style={{
              background: 'var(--accent)', border: 'none', borderRadius: 4,
              padding: '5px 10px', cursor: 'pointer',
              fontFamily: "'DM Mono', monospace", fontSize: 10,
              color: '#000', fontWeight: 700,
            }}
          >SAVE</button>
          <button onClick={() => setEditingKey(false)} style={{ ...iconBtn, padding: '5px 8px' }}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      )}

      {/* Scoring modal */}
      {showScoring && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="scoring-modal-title"
          onClick={e => e.target === e.currentTarget && setShowScoring(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)',
            zIndex: 300, display: 'flex', alignItems: 'flex-start',
            justifyContent: 'center', paddingTop: 64,
          }}
        >
          <div
            style={{
              background: 'var(--bg)', width: 'min(520px, 94vw)',
              border: '1px solid var(--border2)', borderRadius: 12,
              boxShadow: '0 32px 80px rgba(0,0,0,.7)', overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
            }}>
              <span id="scoring-modal-title" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 3, color: 'var(--text)' }}>
                SEASON ROTO · 5×5
              </span>
              <button
                type="button"
                onClick={() => setShowScoring(false)}
                style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 4, padding: '4px 10px', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: "'DM Mono', monospace", fontSize: 10 }}
              >CLOSE <FontAwesomeIcon icon={faXmark} /></button>
            </div>
            <div style={{ padding: '12px 20px 0', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.45 }}>
              Full-season rotisserie: team ranks in each category accumulate from opening day through the end of the year — not weekly H2H scoresheets.
            </div>
            <div style={{ padding: '10px 20px 0', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.45 }}>
              Lineups are <strong style={{ color: 'var(--text)' }}>weekly</strong>, not daily — you cannot swap platoons or stream matchups every day, so part-time and platoon bats carry less value than in daily-lineup leagues.
            </div>
            <div style={{ padding: '16px 20px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 2, color: 'var(--accent)', marginBottom: 10 }}>BATTING</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {BATTING_CATEGORIES.map(row => (
                      <tr key={row.code} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-dim)', padding: '6px 8px 6px 0', width: 36 }}>{row.code}</td>
                        <td style={{ fontFamily: "'DM Sans', sans-serif", color: 'var(--text)', padding: '6px 0' }}>{row.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 2, color: 'var(--blue)', marginBottom: 10 }}>PITCHING</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {PITCHING_CATEGORIES.map(row => (
                      <tr key={row.code} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-dim)', padding: '6px 8px 6px 0', width: 44 }}>{row.code}</td>
                        <td style={{ fontFamily: "'DM Sans', sans-serif", color: 'var(--text)', padding: '6px 0' }}>{row.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ padding: '0 20px 18px', fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)', lineHeight: 1.55 }}>
              <span style={{ color: 'var(--text-dim)' }}>Standings track each category for the full season (rotisserie), not weekly head-to-head matchups.</span>
              {' '}LDB_Score and auction dollars are derived in <code style={{ color: 'var(--text-dim)' }}>generate_data.py</code> from projection CSVs (same underlying stats as these categories).
            </div>
          </div>
        </div>
      )}

      {/* Auction Log modal */}
      {showAuctionLog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auction-log-title"
          onClick={e => e.target === e.currentTarget && setShowAuctionLog(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)',
            zIndex: 300, display: 'flex', alignItems: 'flex-start',
            justifyContent: 'center', paddingTop: 48, overflowY: 'auto',
          }}
        >
          <div
            style={{
              background: 'var(--bg)', width: '95vw', maxWidth: 800,
              maxHeight: '86vh', border: '1px solid var(--border2)',
              borderRadius: 12, overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 32px 80px rgba(0,0,0,.7)',
            }}
          >
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <AuctionLogView onClose={() => setShowAuctionLog(false)} />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

function StatChip({ label, value, dim }) {
  return (
    <div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1.5, color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color: dim ? 'var(--text-dim)' : 'var(--blue)', lineHeight: 1 }}>{value}</div>
    </div>
  )
}
