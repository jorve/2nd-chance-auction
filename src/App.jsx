import { useState } from 'react'
import Header from './components/Header.jsx'
import PlayerList from './components/PlayerList.jsx'
import AuctionPanel from './components/AuctionPanel.jsx'
import FryTargets from './components/FryTargets.jsx'
import LeagueView from './components/LeagueView.jsx'

export default function App() {
  const [showLeague, setShowLeague] = useState(false)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header onLeagueClick={() => setShowLeague(true)} />

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
