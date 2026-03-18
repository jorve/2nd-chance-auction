import { useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowDown,
  faArrowUp,
  faClipboardList,
  faFloppyDisk,
  faKey,
  faLandmark,
  faRotateLeft,
  faToggleOff,
  faToggleOn,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { useApiKeyStore } from '../store/apiKeyStore.js'
import { useAuctionStore, exportAuctionJSON, importAuctionJSON } from '../store/auctionStore.jsx'
import AuctionLogView from './AuctionLogView.jsx'

export default function Header({ onLeagueClick }) {
  const [showAuctionLog, setShowAuctionLog] = useState(false)
  const { teams, sold, fryLens, toggleFryLens, auctionLog, undoLastSale, restoreFromSnapshot } = useAuctionStore()
  const fry = teams['FRY'] || {}
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
        setImportMsg({ ok: true, text: `Restored ${n} sales` })
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
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 1 }}>AUCTION COMMAND CENTER</div>
      </div>

      <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

      {/* FRY budget */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1.5, color: 'var(--text-dim)', marginBottom: 2 }}>FRY BUDGET</div>
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
        ) : <span style={{ color: 'var(--text-faint)' }}>no sales yet</span>}
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* Export */}
      <button
        onClick={exportAuctionJSON}
        disabled={soldCount === 0}
        style={{ ...iconBtn, opacity: soldCount === 0 ? 0.4 : 1 }}
        title="Download auction snapshot as JSON"
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
        title="Load a previously exported auction JSON"
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
          title="Undo last sale"
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
        title="View full auction log with bargains/overpays"
        onMouseEnter={e => { if (auctionLog.length > 0) { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)' }}}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
      >
        <FontAwesomeIcon icon={faClipboardList} />
        LOG
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

      {/* FRY lens */}
      <button onClick={toggleFryLens} style={{
        background: fryLens ? 'var(--accent)' : 'var(--surface2)',
        border: `1px solid ${fryLens ? 'var(--accent)' : 'var(--border2)'}`,
        color: fryLens ? '#0a0c10' : 'var(--text-dim)',
        borderRadius: 5, padding: '6px 14px',
        fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 2,
        transition: 'all .2s', cursor: 'pointer',
      }}>
        <FontAwesomeIcon icon={fryLens ? faToggleOn : faToggleOff} />
        &nbsp;{fryLens ? 'FRY ON' : 'FRY LENS'}
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
