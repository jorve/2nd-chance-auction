import { useState } from 'react'
import { useAuctionStore, FRY_NEEDS } from '../store/auctionStore.jsx'
import PlayerCard from './PlayerCard.jsx'

const TIER_COLORS = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)', 4: 'var(--t4)', 5: 'var(--t5)' }

function getType(p) {
  if (p.pa !== undefined) return 'BAT'
  if (p.gs !== undefined) return 'SP'
  return 'RP'
}

function fryScore(player, fry, type) {
  // Score each player from FRY's perspective
  // Higher = better for FRY to target
  let score = player.ldb_score ?? 0
  const posType = type

  // Boost critical needs heavily
  if (FRY_NEEDS.critical.includes(posType)) score += 20
  // Boost needed positions
  const fills = (player.positions ?? []).filter(p => FRY_NEEDS.needed.includes(p))
  if (fills.length > 0) score += 8

  // Boost ROFR players (FRY has right of first refusal)
  if (player.rfa_team === 'FRY') score += 5

  // Discount if they'd stretch budget too hard
  const budget = fry.budget_current ?? 0
  const pct = budget > 0 ? (player.adj_value ?? 0) / budget : 0
  if (pct > 0.5) score -= 15
  else if (pct > 0.35) score -= 5

  return score
}

function getSignalLabel(player, fry, type) {
  const budget = fry.budget_current ?? 0
  const val = player.adj_value ?? 1
  const pct = budget > 0 ? val / budget : 0

  if (pct > 0.5) return { label: 'RISKY', color: 'var(--red)' }
  if (pct > 0.35) return { label: 'STRETCH', color: 'var(--orange)' }
  if (FRY_NEEDS.critical.includes(type) && player.tier <= 2) return { label: 'MUST BID', color: 'var(--fry)' }
  if (FRY_NEEDS.critical.includes(type)) return { label: 'NEED', color: 'var(--green)' }
  const fills = (player.positions ?? []).filter(p => FRY_NEEDS.needed.includes(p))
  if (fills.length > 0) return { label: 'WANTED', color: 'var(--blue)' }
  if (player.rfa_team === 'FRY') return { label: 'ROFR', color: 'var(--fry)' }
  if (player.tier === 1) return { label: 'ELITE', color: 'var(--t1)' }
  if (player.tier === 2) return { label: 'TARGET', color: 'var(--t2)' }
  return { label: 'WATCH', color: 'var(--text-faint)' }
}

export default function FryTargets() {
  const { batters, sp, rp, sold, teams, setNominatedPlayer } = useAuctionStore()
  const fry = teams['FRY'] || {}
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  const allAvailable = [...batters, ...sp, ...rp].filter(p => !sold[p.name])

  const scored = allAvailable.map(p => {
    const type = getType(p)
    return { ...p, _fryScore: fryScore(p, fry, type), _type: type }
  })

  // Cap RPs at 2 so the list isn't dominated by relievers
  const MAX_RP = 2
  const top10 = (() => {
    const result = []
    let rpCount = 0
    for (const p of scored.sort((a, b) => b._fryScore - a._fryScore)) {
      if (p._type === 'RP') {
        if (rpCount >= MAX_RP) continue
        rpCount++
      }
      result.push(p)
      if (result.length >= 10) break
    }
    return result
  })()

  const budgetColor = fry.budget_current < 20 ? 'var(--red)' : fry.budget_current < 40 ? 'var(--orange)' : 'var(--accent)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px 8px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface2)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 14,
            letterSpacing: 3, color: 'var(--accent)',
          }}>
            FRY TARGETS
          </span>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10,
            color: budgetColor, fontWeight: 600,
          }}>
            ${Math.round(fry.budget_current ?? 0)}M · {fry.slots_current ?? 0} slots
          </span>
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)', marginTop: 2 }}>
          TOP 10 · SCORED FOR SP/RP/SS/2B NEEDS
        </div>
      </div>

      {/* Target list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {top10.map((p, i) => {
          const tColor = TIER_COLORS[p.tier] || 'var(--muted)'
          const signal = getSignalLabel(p, fry, p._type)
          const fills = (p.positions ?? []).filter(pos => FRY_NEEDS.needed.includes(pos))

          return (
            <div
              key={`${p.name}_${p.team}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 14px', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#13161e'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
              onClick={() => setSelectedPlayer(p)}
            >
              {/* Rank number */}
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: 10,
                color: 'var(--muted)', width: 16, flexShrink: 0, textAlign: 'right',
              }}>{i + 1}</div>

              {/* Tier pip */}
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: tColor, flexShrink: 0, boxShadow: p.tier === 1 ? `0 0 5px ${tColor}` : 'none' }} />

              {/* Name + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-dim)', marginTop: 1 }}>
                  {p.team || 'FA'} · {p._type}
                  {fills.length > 0 && <span style={{ color: 'var(--blue)', marginLeft: 4 }}>· {fills.join('/')}</span>}
                  {p.rfa_team === 'FRY' && <span style={{ color: 'var(--fry)', marginLeft: 4 }}>· ROFR</span>}
                </div>
              </div>

              {/* Signal */}
              <div style={{
                fontFamily: "'DM Mono', monospace", fontSize: 8,
                color: signal.color, letterSpacing: 0.5, flexShrink: 0,
                textAlign: 'right',
              }}>
                {signal.label}
              </div>

              {/* Value */}
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif", fontSize: 15,
                color: tColor, flexShrink: 0, minWidth: 40, textAlign: 'right',
              }}>
                ${p.adj_value}M
              </div>
            </div>
          )
        })}

        {top10.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'var(--text-faint)' }}>
            All players sold or budget exhausted
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: '6px 14px', borderTop: '1px solid var(--border)',
        fontFamily: "'DM Mono', monospace", fontSize: 8,
        color: 'var(--text-faint)', flexShrink: 0,
      }}>
        Click any player to view card · Scored for FRY needs
      </div>

      {/* Player card overlay */}
      {selectedPlayer && (
        <PlayerCard
          player={selectedPlayer}
          teams={teams}
          onClose={() => setSelectedPlayer(null)}
          onNominate={p => { setNominatedPlayer(p); setSelectedPlayer(null) }}
        />
      )}
    </div>
  )
}
