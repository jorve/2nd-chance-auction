import { useAuctionStore } from './store/auctionStore.jsx'
import Header from './components/Header.jsx'
import RankingsView from './components/RankingsView.jsx'
import AuctionView from './components/AuctionView.jsx'
import LeagueView from './components/LeagueView.jsx'

const tabs = [
  { id: 'rankings',  label: '📊 Rankings'      },
  { id: 'auction',   label: '🔨 Live Auction'   },
  { id: 'league',    label: '🏟 League Board'   },
]

export default function App() {
  const { activeTab, setActiveTab, auctionLog } = useAuctionStore()

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      {/* Nav */}
      <nav style={{
        display: 'flex', gap: 2, padding: '0 24px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '14px 20px 12px',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 17, letterSpacing: 2,
            color: activeTab === t.id ? 'var(--accent)' : 'var(--text-dim)',
            borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all .15s',
            position: 'relative',
          }}>
            {t.label}
            {t.id === 'auction' && auctionLog.length > 0 && (
              <span style={{
                marginLeft: 8, background: 'var(--orange)',
                color: '#000', borderRadius: 10, fontSize: 10,
                fontFamily: "'DM Mono', monospace",
                padding: '1px 6px', verticalAlign: 'middle',
              }}>{auctionLog.length}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={{ flex: 1 }}>
        {activeTab === 'rankings' && <RankingsView />}
        {activeTab === 'auction'  && <AuctionView />}
        {activeTab === 'league'   && <LeagueView />}
      </main>
    </div>
  )
}
