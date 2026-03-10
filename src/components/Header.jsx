import { useRef, useState } from 'react'
import { useAuctionStore, exportAuctionJSON, importAuctionJSON, savedSessionMeta } from '../store/auctionStore.jsx'

export default function Header({ onLeagueClick }) {
  const { teams, sold, fryLens, toggleFryLens, auctionLog, undoLastSale, restoreFromSnapshot } = useAuctionStore()
  const fry = teams['FRY'] || {}
  const totalPot = Object.values(teams).reduce((s, t) => s + t.budget_current, 0)
  const soldCount = Object.keys(sold).length
  const budgetColor = fry.budget_current < 20 ? 'var(--red)' : fry.budget_current < 40 ? 'var(--orange)' : 'var(--accent)'
  const importRef = useRef()
  const [importMsg, setImportMsg] = useState(null)

  function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    importAuctionJSON(file)
      .then(snapshot => {
        restoreFromSnapshot(snapshot)
        const n = Object.keys(snapshot.sold).length
        setImportMsg({ ok: true, text: `✓ Restored ${n} sales` })
        setTimeout(() => setImportMsg(null), 3000)
      })
      .catch(err => {
        setImportMsg({ ok: false, text: `⚠ ${err.message}` })
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
        {soldCount > 0 ? <>💾 <span>AUTO-SAVED</span></> : <span style={{ color: 'var(--text-faint)' }}>no sales yet</span>}
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
        ↓ EXPORT
      </button>

      {/* Import */}
      <button
        onClick={() => importRef.current?.click()}
        style={iconBtn}
        title="Load a previously exported auction JSON"
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
      >
        ↑ IMPORT
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
          style={iconBtn}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--orange)'; e.currentTarget.style.color = 'var(--orange)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-dim)' }}
        >
          ↩ UNDO
          <span style={{ background: 'var(--border2)', borderRadius: 8, padding: '1px 6px', fontSize: 9 }}>
            {auctionLog.length}
          </span>
        </button>
      )}

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
        🏟 LEAGUE BOARD
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
        {fryLens ? '● FRY ON' : '○ FRY LENS'}
      </button>
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
