import { useState, useEffect } from 'react'
import Header from './components/Header.jsx'
import PlayerList from './components/PlayerList.jsx'
import AuctionPanel from './components/AuctionPanel.jsx'
import FryTargets from './components/FryTargets.jsx'
import LeagueView from './components/LeagueView.jsx'
import { savedSessionMeta, useAuctionStore } from './store/auctionStore.jsx'

export default function App() {
  const [showLeague, setShowLeague] = useState(false)
  const [resumeBanner, setResumeBanner] = useState(() => savedSessionMeta())
  const soldCount = Object.keys(useAuctionStore(s => s.sold)).length

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header onLeagueClick={() => setShowLeague(true)} />

      {/* ── Resume session banner ── */}
      {resumeBanner && soldCount === 0 && (
        <div style={{
          background: 'rgba(200,241,53,.07)', borderBottom: '1px solid rgba(200,241,53,.25)',
          padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <span style={{ fontSize: 13 }}>💾</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--accent)' }}>
            Saved session found — <strong>{resumeBanner.soldCount} sales</strong> from {new Date(resumeBanner.savedAt).toLocaleString()}
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-dim)' }}>
            (automatically restored)
          </span>
          <button
            onClick={() => setResumeBanner(null)}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: "'DM Mono', monospace",
              fontSize: 10, color: 'var(--text-faint)', padding: '2px 6px',
            }}
          >dismiss ✕</button>
        </div>
      )}

      {/* Two-pane layout */}
      <div style={{
        flex: 1, display: 'grid',
        gridTemplateColumns: '1fr 440px',
        minHeight: 0, overflow: 'hidden',
      }}>
        {/* LEFT — full player pool */}
        <div style={{ borderRight: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <PlayerList />
        </div>

        {/* RIGHT — auction (top) + FRY targets (bottom) */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
          <div style={{ overflowY: 'auto', maxHeight: '62vh', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <AuctionPanel />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <FryTargets />
          </div>
        </div>
      </div>

      {/* League Board modal */}
      {showLeague && (
        <div
          onClick={e => e.target === e.currentTarget && setShowLeague(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)',
            zIndex: 300, display: 'flex', alignItems: 'flex-start',
            justifyContent: 'center', paddingTop: 48,
          }}
        >
          <div style={{
            background: 'var(--bg)', width: '95vw', maxWidth: 1440,
            maxHeight: '86vh', border: '1px solid var(--border2)',
            borderRadius: 12, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 32px 80px rgba(0,0,0,.7)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 24px', background: 'var(--surface)',
              borderBottom: '1px solid var(--border)', flexShrink: 0,
            }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: 'var(--text)' }}>
                LEAGUE BOARD
              </span>
              <button
                onClick={() => setShowLeague(false)}
                style={{
                  background: 'none', border: '1px solid var(--border2)',
                  borderRadius: 4, padding: '5px 14px',
                  color: 'var(--text-dim)', fontFamily: "'DM Mono', monospace",
                  fontSize: 11, cursor: 'pointer',
                }}
              >CLOSE ✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <LeagueView />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
