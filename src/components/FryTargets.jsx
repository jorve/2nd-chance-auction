import { useState } from 'react'
import { useAuctionStore, FRY_NEEDS } from '../store/auctionStore.jsx'
import PlayerCard from './PlayerCard.jsx'
import { getFryPriorityScore, getFrySignal, getPlayerType } from '../utils/frySignal.js'

const TIER_COLORS = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)', 4: 'var(--t4)', 5: 'var(--t5)' }

export default function FryTargets() {
  const { batters, sp, rp, sold, teams, setNominatedPlayer } = useAuctionStore()
  const fry = teams['FRY'] || {}
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  const allAvailable = [...batters, ...sp, ...rp].filter(p => !sold[p.name])

  const scored = allAvailable.map(p => {
    const type = getPlayerType(p)
    return { ...p, _fryScore: getFryPriorityScore(p, fry, type), _type: type }
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
          const signal = getFrySignal(p, fry, p._type)
          const fills = (p.positions ?? []).filter(pos => FRY_NEEDS.needed.includes(pos))

          return (
            <div
              key={`${p.name}_${p.team}`}
              role="button"
              tabIndex={0}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 14px', borderBottom: '1px solid var(--border)',
                cursor: 'pointer', transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#13161e'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
              onClick={() => setSelectedPlayer(p)}
              onDoubleClick={() => { setNominatedPlayer(p); setSelectedPlayer(null) }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setNominatedPlayer(p)
                  setSelectedPlayer(null)
                }
              }}
              aria-label={`${p.name}, ${p._type}, $${p.adj_value}M. Double-click to nominate.`}
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
                  {p.name}{p.positions?.length ? ` | ${p.positions.join(' · ')}` : ''}
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
        Click to view card · Double-click or Enter to nominate
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
