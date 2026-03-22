import { useState, useMemo } from 'react'
import {
  useAuctionStore,
  FRY_NEEDS,
  MY_TEAM_ABBR,
  canDraftPlayerForTeam,
  countTeamPicksByType,
  STARTER_SLOT_TARGETS,
} from '../store/auctionStore.jsx'
import PlayerCard from './PlayerCard.jsx'
import { getFrySignal, getPlayerType } from '../utils/frySignal.js'

const TIER_COLORS = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)', 4: 'var(--t4)', 5: 'var(--t5)' }

function adjValueNum(p) {
  const v = parseFloat(p.adj_value)
  return Number.isFinite(v) ? v : 0
}

export default function FryTargets() {
  const { batters, sp, rp, sold, teams, setNominatedPlayer, auctionLog } = useAuctionStore()
  const fry = teams[MY_TEAM_ABBR] || {}
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  const slotsLeft = fry.slots_current ?? 0
  const battersByName = useMemo(() => new Map(batters.map((b) => [b.name, b])), [batters])

  const { top10, needLine } = useMemo(() => {
    const allAvailable = [...batters, ...sp, ...rp].filter((p) => !sold[p.name])
    const targets = STARTER_SLOT_TARGETS
    const { bat, sp: spC, rp: rpC } = countTeamPicksByType(sold, MY_TEAM_ABBR)
    const needBat = Math.max(0, targets.bat - bat)
    const needSp = Math.max(0, targets.sp - spC)
    const needRp = Math.max(0, targets.rp - rpC)
    const startersDone = needBat === 0 && needSp === 0 && needRp === 0
    const needLine = startersDone
      ? 'Starters filled · bench / any'
      : `Need starters: ${needBat} bat · ${needSp} SP · ${needRp} RP`

    if (slotsLeft <= 0) {
      return { top10: [], needLine }
    }

    const draftCtx = { auctionLog, battersByName }
    const eligible = allAvailable.filter((p) =>
      canDraftPlayerForTeam(sold, MY_TEAM_ABBR, p, STARTER_SLOT_TARGETS, draftCtx).ok,
    )
    const sorted = [...eligible].sort((a, b) => {
      const d = adjValueNum(b) - adjValueNum(a)
      if (d !== 0) return d
      return (a.rank ?? 999) - (b.rank ?? 999)
    })
    return { top10: sorted.slice(0, 10), needLine }
  }, [batters, sp, rp, sold, slotsLeft, auctionLog, battersByName])

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
            MY TARGETS
          </span>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10,
            color: budgetColor, fontWeight: 600,
          }}>
            ${Math.round(fry.budget_current ?? 0)}M · {fry.slots_current ?? 0} slots
          </span>
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'var(--text-faint)', marginTop: 2 }}>
          TOP 10 BY ADJ $ · {needLine}
        </div>
      </div>

      {/* Target list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {top10.map((p, i) => {
          const tColor = TIER_COLORS[p.tier] || 'var(--muted)'
          const pType = getPlayerType(p)
          const signal = getFrySignal(p, fry, pType)
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
              aria-label={`${p.name}, ${pType}, $${p.adj_value}M. Double-click to nominate.`}
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
                  {p.team || 'FA'} · {pType}
                  {fills.length > 0 && <span style={{ color: 'var(--blue)', marginLeft: 4 }}>· {fills.join('/')}</span>}
                  {p.rfa_team === MY_TEAM_ABBR && <span style={{ color: 'var(--fry)', marginLeft: 4 }}>· ROFR</span>}
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
            {slotsLeft <= 0
              ? 'No open roster slots'
              : 'No eligible players (all sold or nothing fits current starter needs)'}
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
