import { useAuctionStore, META } from '../store/auctionStore.jsx'

export default function Header() {
  const { teams, sold, fryLens, toggleFryLens, auctionLog } = useAuctionStore()
  const fry = teams['FRY'] || {}
  const totalPot = Object.values(teams).reduce((s, t) => s + t.budget_current, 0)
  const soldCount = Object.keys(sold).length

  return (
    <header style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '14px 24px',
      display: 'flex', alignItems: 'center', gap: 24,
      flexWrap: 'wrap',
    }}>
      {/* Logo */}
      <div>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 28, letterSpacing: 4, color: 'var(--accent)', lineHeight: 1,
        }}>LDB 2026</div>
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 2,
        }}>AUCTION COMMAND CENTER</div>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* League pool */}
        <Pill label="LEAGUE POOL" value={`$${Math.round(totalPot)}M`} color="var(--blue)" />
        <Pill label="SOLD" value={soldCount} color="var(--text-dim)" />

        {/* Divider */}
        <div style={{ width: 1, height: 32, background: 'var(--border)', margin: '0 4px' }} />

        {/* FRY stats */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: fryLens ? 'rgba(200,241,53,.08)' : 'transparent',
          border: `1px solid ${fryLens ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 6, padding: '6px 12px',
          transition: 'all .2s',
        }}>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 14, letterSpacing: 2, color: 'var(--accent)',
          }}>FRY</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: "'DM Mono', monospace" }}>·</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: fry.budget_current < 20 ? 'var(--red)' : 'var(--text)' }}>
            ${Math.round(fry.budget_current ?? 0)}M left
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: "'DM Mono', monospace" }}>·</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-dim)' }}>
            {fry.slots_current ?? 0} slots
          </span>
        </div>
      </div>

      {/* FRY lens toggle */}
      <button onClick={toggleFryLens} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: fryLens ? 'var(--accent)' : 'var(--surface2)',
        border: `1px solid ${fryLens ? 'var(--accent)' : 'var(--border2)'}`,
        color: fryLens ? '#0a0c10' : 'var(--text-dim)',
        borderRadius: 6, padding: '8px 16px',
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 14, letterSpacing: 2,
        transition: 'all .2s', cursor: 'pointer',
      }}>
        <span>{fryLens ? '●' : '○'}</span>
        FRY LENS
      </button>
    </header>
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
