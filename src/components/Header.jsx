import { useAuctionStore } from '../store/auctionStore.jsx'

export default function Header({ onLeagueClick }) {
  const { teams, sold, fryLens, toggleFryLens, auctionLog, undoLastSale } = useAuctionStore()
  const fry = teams['FRY'] || {}
  const totalPot = Object.values(teams).reduce((s, t) => s + t.budget_current, 0)
  const soldCount = Object.keys(sold).length
  const budgetColor = fry.budget_current < 20 ? 'var(--red)' : fry.budget_current < 40 ? 'var(--orange)' : 'var(--accent)'

  return (
    <header style={{
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 16,
    }}>
      {/* Logo */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 4, color: 'var(--accent)', lineHeight: 1 }}>LDB 2026</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 1 }}>AUCTION COMMAND CENTER</div>
      </div>

      <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

      {/* FRY budget — prominent */}
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

      {/* League pool + sold */}
      <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
        <StatChip label="POOL" value={`$${Math.round(totalPot)}M`} />
        <StatChip label="SOLD" value={soldCount} dim />
      </div>

      <div style={{ flex: 1 }} />

      {/* Auction log count + undo */}
      {auctionLog.length > 0 && (
        <button
          onClick={undoLastSale}
          style={{
            background: 'none', border: '1px solid var(--border2)', borderRadius: 5,
            padding: '5px 12px', color: 'var(--text-dim)',
            fontFamily: "'DM Mono', monospace", fontSize: 10, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
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

      {/* FRY lens toggle */}
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

function Pill({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '6px 12px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1.5, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1, color }}>
        {value}
      </span>
    </div>
  )
}
