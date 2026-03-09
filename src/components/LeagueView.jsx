import { useAuctionStore, TEAM_COLORS } from '../store/auctionStore.jsx'
import { LDB_DATA } from '../data/ldb_data.js'

export default function LeagueView() {
  const { teams, sold, auctionLog, batters, sp, rp } = useAuctionStore()

  // Sort teams by remaining budget descending
  const teamList = Object.values(teams).sort((a, b) => b.budget_current - a.budget_current)

  // Budget bar max
  const maxBudget = Math.max(...teamList.map(t => t.budget_initial ?? t.budget_rem))

  // Build per-team roster from sold + initial keepers
  function getTeamWins(abbr) {
    return auctionLog.filter(e => e.team === abbr)
  }

  // Position needs by team (from draft board initial + auction wins)
  function getPositionCoverage(abbr) {
    const initial = LDB_DATA.roster_by_team[abbr] || []
    const wins = getTeamWins(abbr)
    const posCounts = {}
    initial.forEach(p => {
      const pos = p.pos
      posCounts[pos] = (posCounts[pos] || 0) + 1
    })
    wins.forEach(w => {
      const pos = w.pos_type === 'batter' ? 'BAT' : w.pos_type === 'sp' ? 'SP' : 'RP'
      posCounts[pos] = (posCounts[pos] || 0) + 1
    })
    return posCounts
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: 'var(--text)' }}>
          LEAGUE BOARD — 2026 AUCTION
        </h2>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-dim)' }}>
          {Object.keys(sold).length} players sold · ${Math.round(auctionLog.reduce((s, e) => s + e.price, 0))}M spent
        </div>
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24,
      }}>
        <SummaryCard label="TOTAL REMAINING" value={`$${Math.round(Object.values(teams).reduce((s, t) => s + t.budget_current, 0))}M`} color="var(--blue)" />
        <SummaryCard label="PLAYERS SOLD" value={Object.keys(sold).length} color="var(--text-dim)" />
        <SummaryCard label="TOTAL SPENT" value={`$${Math.round(auctionLog.reduce((s, e) => s + e.price, 0))}M`} color="var(--orange)" />
        <SummaryCard label="SLOTS REMAINING" value={Object.values(teams).reduce((s, t) => s + t.slots_current, 0)} color="var(--purple)" />
      </div>

      {/* Team grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {teamList.map(team => (
          <TeamCard
            key={team.abbr}
            team={team}
            maxBudget={maxBudget}
            wins={getTeamWins(team.abbr)}
            isFry={team.abbr === 'FRY'}
            roster={LDB_DATA.roster_by_team[team.abbr] || []}
          />
        ))}
      </div>

      {/* Position placeholder note */}
      <div style={{
        marginTop: 24, padding: 16,
        background: 'var(--surface)', border: '1px dashed var(--border2)',
        borderRadius: 8, fontFamily: "'DM Mono', monospace",
        fontSize: 11, color: 'var(--text-dim)',
      }}>
        📋 <strong style={{ color: 'var(--accent)' }}>Position file not loaded.</strong>
        {' '}Add a <code style={{ color: 'var(--blue)' }}>player_positions.csv</code> to enable positional scarcity tracking.
        Format: <code>Name,Positions</code> — e.g. <code>Aaron Judge,"RF,OF"</code>
      </div>
    </div>
  )
}

// ── TEAM CARD ──────────────────────────────────────────────────────────────────
function TeamCard({ team, maxBudget, wins, isFry, roster }) {
  const color = TEAM_COLORS[team.abbr] || 'var(--text-dim)'
  const budgetPct = maxBudget > 0 ? (team.budget_current / maxBudget) * 100 : 0
  const spentAuction = wins.reduce((s, w) => s + w.price, 0)
  const threat = getBudgetThreat(team.budget_current)

  return (
    <div style={{
      background: isFry ? 'rgba(200,241,53,.04)' : 'var(--surface)',
      border: `1px solid ${isFry ? 'var(--accent)44' : 'var(--border)'}`,
      borderRadius: 8, padding: 16,
      boxShadow: isFry ? '0 0 20px rgba(200,241,53,.08)' : 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2, color,
          }}>{team.abbr}</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-dim)' }}>
            {team.gm}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: 9,
            background: threat.bg, color: threat.color,
            padding: '2px 7px', borderRadius: 10, letterSpacing: 1,
          }}>{threat.label}</span>
        </div>
      </div>

      {/* Budget bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-dim)' }}>BUDGET REMAINING</span>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color, lineHeight: 1 }}>
              ${Math.round(team.budget_current)}M
            </span>
            {team.carryover != null && team.carryover !== 0 && (
              <span style={{ display: 'block', fontFamily: "'DM Mono', monospace", fontSize: 9, color: team.carryover < 0 ? 'var(--red)' : 'var(--green)' }}>
                C/O {team.carryover > 0 ? '+' : ''}{team.carryover}M
              </span>
            )}
          </div>
        </div>
        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${Math.min(100, budgetPct)}%`,
            background: budgetPct > 60 ? 'var(--green)' : budgetPct > 30 ? color : 'var(--red)',
            transition: 'width .3s',
          }} />
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <Stat label="SLOTS" value={team.slots_current} />
        <Stat label="AUCTION WINS" value={wins.length} />
        <Stat label="SPENT TODAY" value={`$${Math.round(spentAuction)}M`} />
        <Stat label="$/SLOT" value={team.slots_current > 0 ? `$${Math.round(team.budget_current / team.slots_current)}` : '—'} />
      </div>

      {/* Recent wins */}
      {wins.length > 0 && (
        <div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 6 }}>
            AUCTION WINS
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {wins.slice(0, 8).map(w => (
              <span key={w.playerName} style={{
                fontFamily: "'DM Mono', monospace", fontSize: 9,
                background: 'var(--border)', padding: '2px 6px', borderRadius: 3,
                color: 'var(--text-dim)',
              }}>
                {w.playerName.split(' ').map(n => n[0]).join('.')} ${w.price}M
              </span>
            ))}
            {wins.length > 8 && (
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)' }}>
                +{wins.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Keepers preview */}
      {roster.length > 0 && wins.length === 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>
              KEEPERS ({roster.length})
            </div>
            {roster.filter(p => p.is_k3).length > 0 && (
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--orange)', letterSpacing: 1 }}>
                {roster.filter(p => p.is_k3).length} ROFR EXPIR.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {[...roster].sort((a, b) => (b.is_k3 ? 1 : b.is_hth ? 0.5 : 0) - (a.is_k3 ? 1 : a.is_hth ? 0.5 : 0))
              .slice(0, 8).map(p => {
                const isK3  = p.is_k3
                const isHTH = p.is_hth
                const bg = isK3 ? 'rgba(251,146,60,.15)' : isHTH ? 'rgba(248,113,113,.12)' : 'var(--border)'
                const textColor = isK3 ? 'var(--orange)' : isHTH ? 'var(--red)' : 'var(--text-dim)'
                return (
                  <span key={p.name} style={{
                    fontFamily: "'DM Mono', monospace", fontSize: 9,
                    background: bg, padding: '2px 6px', borderRadius: 3,
                    color: textColor, border: isK3 ? '1px solid rgba(251,146,60,.3)' : isHTH ? '1px solid rgba(248,113,113,.3)' : 'none',
                  }} title={isK3 ? 'K3 — Final year, ROFR eligible' : isHTH ? 'HTH — 1-year only, no renewal' : `${p.contract}`}>
                    {p.name.split(' ').slice(-1)[0]} ${p.salary}M
                    {isK3 && <span style={{ marginLeft: 3, fontSize: 8 }}>ROFR</span>}
                    {isHTH && <span style={{ marginLeft: 3, fontSize: 8 }}>HTH</span>}
                  </span>
                )
              })}
            {roster.length > 8 && (
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)' }}>
                +{roster.length - 8}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function getBudgetThreat(budget) {
  if (budget >= 160) return { label: 'VERY HIGH', color: '#f87171', bg: 'rgba(248,113,113,.1)' }
  if (budget >= 130) return { label: 'HIGH', color: '#fb923c', bg: 'rgba(251,146,60,.1)' }
  if (budget >= 100) return { label: 'MODERATE', color: '#fbbf24', bg: 'rgba(251,191,36,.1)' }
  if (budget >= 60)  return { label: 'LOWER', color: '#4ade80', bg: 'rgba(74,222,128,.1)' }
  return { label: 'CONSTRAINED', color: '#94a3b8', bg: 'rgba(148,163,184,.1)' }
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, textAlign: 'center',
    }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color, letterSpacing: 1 }}>{value}</div>
    </div>
  )
}
