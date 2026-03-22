import { useAuctionStore, TEAM_COLORS, fmtPrice } from '../store/auctionStore.jsx'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'

export default function AuctionLogView({ onClose }) {
  const { auctionLog } = useAuctionStore()
  const chronological = [...auctionLog].reverse()

  const bargains = auctionLog.filter(e => (e.est_value ?? 0) > 0 && e.price < e.est_value)
  const overpays = auctionLog.filter(e => (e.est_value ?? 0) > 0 && e.price > e.est_value)

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: 'var(--text)' }}>
          DRAFT LOG — {auctionLog.length} picks
        </h2>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: '1px solid var(--border2)',
            borderRadius: 4, padding: '5px 14px',
            color: 'var(--text-dim)', fontFamily: "'DM Mono', monospace",
            fontSize: 11, cursor: 'pointer',
          }}
        >CLOSE <FontAwesomeIcon icon={faXmark} /></button>
      </div>

      {/* Summary: bargains & overpays */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{
          background: 'rgba(74,222,128,.12)', border: '1px solid rgba(74,222,128,.35)',
          borderRadius: 6, padding: '10px 16px', flex: 1, minWidth: 140,
        }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--green)', letterSpacing: 1, marginBottom: 4 }}>BARGAINS</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: 'var(--green)' }}>{bargains.length}</div>
        </div>
        <div style={{
          background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.35)',
          borderRadius: 6, padding: '10px 16px', flex: 1, minWidth: 140,
        }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--red)', letterSpacing: 1, marginBottom: 4 }}>OVERPAYS</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: 'var(--red)' }}>{overpays.length}</div>
        </div>
      </div>

      {/* Full log */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={th}>#</th>
              <th style={{ ...th, textAlign: 'left' }}>Player</th>
              <th style={th}>Team</th>
              <th style={th}>Price</th>
              <th style={th}>Est</th>
              <th style={th}>Δ</th>
              <th style={th}>Clock</th>
            </tr>
          </thead>
          <tbody>
            {chronological.map((e, i) => {
              const est = e.est_value ?? 0
              const delta = est > 0 ? e.price - est : 0
              const isBargain = delta < 0
              const isOverpay = delta > 0
              const tc = TEAM_COLORS[e.team] || 'var(--text-dim)'
              return (
                <tr key={e.ts + i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={td}>{chronological.length - i}</td>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 500 }}>{e.playerName}</td>
                  <td style={{ ...td, color: tc }}>{e.team}</td>
                  <td style={td}>{fmtPrice(e.price)}</td>
                  <td style={td}>{est > 0 ? fmtPrice(est) : '—'}</td>
                  <td style={{ ...td, color: isBargain ? 'var(--green)' : isOverpay ? 'var(--red)' : 'var(--text-dim)' }}>
                    {est > 0 ? (delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)) : '—'}
                  </td>
                  <td style={{ ...td, fontSize: 10, color: 'var(--text-faint)' }}>{e.nominatedBy || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th = { padding: '10px 12px', fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', textAlign: 'right' }
const td = { padding: '8px 12px', fontFamily: "'DM Mono', monospace", fontSize: 11, textAlign: 'right' }
