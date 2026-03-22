import { useMemo } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleCheck, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { useAuctionStore, TEAM_COLORS, MY_TEAM_ABBR } from '../store/auctionStore.jsx'
import {
  selectAuctionLog,
  selectBatters,
  selectRp,
  selectSold,
  selectSp,
  selectTeams,
} from '../store/auctionSelectors.js'
import { USE_CUSTOM_LEAGUE, getSnakeOwner } from '../config/snakeDraftOrder.js'
import { LDB_DATA } from '../data/ldb_data.js'
import { norm } from '../utils/norm.js'

export default function LeagueView() {
  const teams = useAuctionStore(selectTeams)
  const sold = useAuctionStore(selectSold)
  const auctionLog = useAuctionStore(selectAuctionLog)
  const batters = useAuctionStore(selectBatters)
  const sp = useAuctionStore(selectSp)
  const rp = useAuctionStore(selectRp)

  // Sort teams by remaining budget descending
  const teamList = Object.values(teams).sort((a, b) => b.budget_current - a.budget_current)

  // Budget bar max
  const maxBudget = Math.max(...teamList.map(t => t.budget_initial ?? t.budget_rem))

  // Inflation & spend pace
  const metrics = useMemo(() => {
    const allPlayers = [...batters, ...sp, ...rp]
    const unsold = allPlayers.filter(p => !sold[p.name])
    const totalRemaining = Object.values(teams).reduce((s, t) => s + t.budget_current, 0)
    const totalSpent = auctionLog.reduce((s, e) => s + e.price, 0)
    const meta = LDB_DATA.meta || {}
    const totalBudget = meta.total_budget || (totalRemaining + totalSpent)
    const remainingValue = unsold.reduce((s, p) => s + (p.est_value ?? 0), 0)
    const inflation = remainingValue > 0 ? ((totalRemaining / remainingValue) - 1) * 100 : 0
    const playerPct = allPlayers.length > 0 ? (Object.keys(sold).length / allPlayers.length) * 100 : 0
    const budgetPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
    return { inflation, playerPct, budgetPct, unsold, totalRemaining, remainingValue }
  }, [batters, sp, rp, sold, teams, auctionLog])

  // Who's left: by position, elite count
  const whosLeft = useMemo(() => {
    const unsold = [...batters, ...sp, ...rp].filter(p => !sold[p.name])
    const byPos = {}
    let elite = 0
    for (const p of unsold) {
      for (const pos of (p.positions || [])) {
        byPos[pos] = (byPos[pos] || 0) + 1
      }
      if (p.tier <= 2) elite++
    }
    return { byPos, elite }
  }, [batters, sp, rp, sold])

  // Pre-auction validation
  const validation = useMemo(() => {
    const meta = LDB_DATA.meta || {}
    const totalBudget = Object.values(teams).reduce((s, t) => s + t.budget_current, 0)
    const expectedBudget = USE_CUSTOM_LEAGUE
      ? Object.values(teams).reduce((s, t) => s + (t.budget_initial ?? t.budget_rem ?? 0), 0)
      : meta.total_budget || 0
    const totalSlots = Object.values(teams).reduce((s, t) => s + (t.slots_current ?? 0), 0)
    const issues = []
    if (!USE_CUSTOM_LEAGUE && Math.abs(totalBudget - expectedBudget) > 0.01) {
      issues.push(`Budget mismatch: $${Math.round(totalBudget)}M remaining vs expected $${Math.round(expectedBudget)}M total`)
    }
    return { ok: issues.length === 0, issues, totalBudget, totalSlots }
  }, [teams, auctionLog])

  function getTeamWins(abbr) {
    return auctionLog.filter(e => e.team === abbr)
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 3, color: 'var(--text)' }}>
          LEAGUE BOARD — 2026 AUCTION
        </h2>
        {auctionLog.length === 0 && (
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10,
            color: validation.ok ? 'var(--green)' : 'var(--orange)',
            background: validation.ok ? 'rgba(74,222,128,.1)' : 'rgba(251,146,60,.1)',
            padding: '4px 10px', borderRadius: 4,
          }}>
            {validation.ok ? (
              <>
                <FontAwesomeIcon icon={faCircleCheck} /> Pre-auction OK
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faTriangleExclamation} /> {validation.issues[0]}
              </>
            )}
          </span>
        )}
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-dim)' }}>
          {Object.keys(sold).length} players sold · ${Math.round(auctionLog.reduce((s, e) => s + e.price, 0))}M spent
        </div>
      </div>

      {/* Inflation + spend pace */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap',
        background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '12px 16px',
      }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)', letterSpacing: 1 }}>
          INFLATION <span style={{ color: metrics.inflation > 15 ? 'var(--orange)' : 'var(--text)', fontWeight: 600 }}>{metrics.inflation.toFixed(1)}%</span>
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)', letterSpacing: 1 }}>
          SPEND PACE <span style={{ color: 'var(--text)', fontWeight: 600 }}>{metrics.playerPct.toFixed(0)}%</span> players · <span style={{ fontWeight: 600 }}>{metrics.budgetPct.toFixed(0)}%</span> budget
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)', letterSpacing: 1 }}>
          $/VALUE <span style={{ color: 'var(--purple)', fontWeight: 600 }}>
            {metrics.remainingValue > 0 ? `$${(metrics.totalRemaining / metrics.remainingValue).toFixed(2)}M` : '—'}
          </span> per LDB point
        </div>
      </div>

      {/* Who's left */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap',
        fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--text-dim)',
      }}>
        <span>LEFT: </span>
        {Object.entries(whosLeft.byPos).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([pos, n]) => (
          <span key={pos} style={{ background: 'var(--border)', padding: '2px 8px', borderRadius: 4 }}>{pos}: {n}</span>
        ))}
        <span style={{ color: 'var(--t1)', fontWeight: 600 }}>T1–2: {whosLeft.elite}</span>
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
            isFry={team.abbr === MY_TEAM_ABBR}
            roster={LDB_DATA.roster_by_team[team.abbr] || []}
          />
        ))}
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

  // ── Surplus value calculation ───────────────────────────────────────────────
  const tvMap = LDB_DATA.theoretical_values || {}

  // Keeper surplus: theoretical_value is baked into each roster_by_team entry.
  // Only include entries where TV is known — excludes GM/budget rows (no projection data).
  const keeperPlayers  = roster.filter(p => p.theoretical_value != null)
  const keeperTotalTV     = keeperPlayers.reduce((s, p) => s + p.theoretical_value, 0)
  const keeperTotalSalary = keeperPlayers.reduce((s, p) => s + (p.salary ?? 0), 0)

  // Auction wins surplus: look up from flat theoretical_values dict
  const auctionTotalTV     = wins.reduce((s, w) => s + (tvMap[norm(w.playerName)] ?? 0), 0)
  const auctionTotalSalary = wins.reduce((s, w) => s + (w.price ?? 0), 0)

  const totalTV      = keeperTotalTV + auctionTotalTV
  const totalSurplus = totalTV - (keeperTotalSalary + auctionTotalSalary)
  const totalSalary  = keeperTotalSalary + auctionTotalSalary
  // Efficiency: how far ahead/behind fair value the team's spend is (positive = good deal)
  const efficiency   = totalSalary > 0 ? (totalSurplus / totalSalary) * 100 : null
  const hasSurplusData = (keeperPlayers.length > 0 || wins.length > 0)

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
          }}>{team.name || team.abbr}</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-dim)' }}>
            {getSnakeOwner(team.abbr) || team.owner || team.gm || team.abbr}
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
      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <Stat label="SLOTS" value={team.slots_current} />
        <Stat label="AUCTION WINS" value={wins.length} />
        <Stat label="SPENT TODAY" value={`$${Math.round(spentAuction)}M`} />
        <Stat label="$/SLOT" value={team.slots_current > 0 ? `$${Math.round(team.budget_current / team.slots_current)}` : '—'} />
      </div>

      {/* Surplus row */}
      {hasSurplusData && (
        <div style={{
          display: 'flex', gap: 12, marginBottom: 12,
          padding: '6px 8px', borderRadius: 4,
          background: totalSurplus >= 0 ? 'rgba(74,222,128,.06)' : 'rgba(248,113,113,.06)',
          border: `1px solid ${totalSurplus >= 0 ? 'rgba(74,222,128,.15)' : 'rgba(248,113,113,.15)'}`,
        }}>
          <Stat
            label="SURPLUS"
            value={
              <span style={{ color: totalSurplus >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {totalSurplus >= 0 ? '+' : '-'}${Math.abs(Math.round(totalSurplus))}M
              </span>
            }
          />
          {efficiency !== null && (
            <Stat
              label="EFFICIENCY"
              value={
                <span style={{ color: efficiency >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {efficiency >= 0 ? '+' : ''}{efficiency.toFixed(0)}%
                </span>
              }
            />
          )}
          <Stat
            label="TV TOTAL"
            value={<span style={{ color: 'var(--text-dim)' }}>${Math.round(totalTV)}M</span>}
          />
        </div>
      )}

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
