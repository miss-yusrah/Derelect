import type { GameSnapshot } from '../lib/state'
import { formatCredits } from '@derelict/game-model'
import { FUEL_CAPACITY, HULL_CAPACITY } from '@derelict/game-model'
import { IconCredits, IconFuel, IconHull, IconLock } from './icons'
import { Gauge, StatRow } from './primitives'

export interface StatusRailProps {
  snapshot: GameSnapshot
  source: 'model' | 'chain'
  /** Index of the last cell that just changed (fuel gauge flash), or null. */
  fuelFlashCell?: number | null
}

export function StatusRail({ snapshot, source, fuelFlashCell = null }: StatusRailProps) {
  const isPractice = source === 'model'
  const stationTag = snapshot.stationAccount.startsWith('station.practice')
    ? 'REL-07 // ORBITAL SALVAGE'
    : 'ON-GRID // ORBITAL SALVAGE'

  const operating = formatCredits(snapshot.operatingYocto)
  const repairHeld = snapshot.repairDueTurn !== null && !snapshot.repairPaid
  const reserved = repairHeld ? 4000000000000000000000n : 0n

  return (
    <aside className="rail-left" aria-label="Station status">
      <div className="rail-left__ident">
        <div className="rail-left__title">STATION</div>
        <div className="rail-left__name">
          {stationNameFrom(snapshot)}
          <small>{isPractice ? 'PRACTICE STATION — LOCAL MODEL' : 'ORBITAL SALVAGE STATION'}</small>
        </div>
      </div>

      {/* Primary readouts: the numbers a captain glances at every turn. */}
      <section className="rail-left__primary" aria-label="Primary resources and funds">
        <Gauge
          icon={<IconFuel size={16} />}
          label="FUEL"
          value={String(snapshot.fuel)}
          cells={snapshot.fuel}
          cellCount={FUEL_CAPACITY}
          flashIndex={fuelFlashCell}
          danger={snapshot.fuel <= 1}
        />
        <Gauge
          icon={<IconHull size={16} />}
          label="HULL"
          value={String(snapshot.hull)}
          cells={snapshot.hull}
          cellCount={HULL_CAPACITY}
          danger={snapshot.hull === 1}
        />
        <div className="score" title="Unprotected operating funds (station money; the score)">
          <span className="score__label">
            <IconCredits size={15} />
            OPERATING FUNDS
          </span>
          <span className="score__value" aria-label={`${operating} credits operating`}>
            {operating}
            <span className="score__unit"> Cr</span>
          </span>
          <span className="score__note">THE SCORE — SPENDABLE STATION MONEY</span>
        </div>
      </section>

      {/* Secondary: protected money the captain cannot freely spend. */}
      <section className="rail-left__secondary" aria-label="Protected and escrowed funds">
        <StatRow
          icon={<IconLock size={14} />}
          label="PROTECTED REPAIR"
          amount={formatCredits(reserved)}
          unit="Cr"
          active={repairHeld}
          hint={
            repairHeld
              ? snapshot.repairApplied
                ? 'hull restored · claim live'
                : `lands after T${snapshot.repairDueTurn}`
              : undefined
          }
          title="Reserved for the commissioned repair; creditors keep their claim"
        />
        <StatRow
          icon={null}
          label="VISITOR ESCROW"
          amount={formatCredits(snapshot.visitorsEscrowYocto)}
          unit="Cr"
          title="Prepaid offers held for visiting ships"
        />
      </section>

      {/* Tertiary: identity and ledger coordinates. */}
      <div className="rail-left__captain">
        <span className="k">CAPTAIN (NFT OWNER)</span>
        <span className="v" title={snapshot.owner}>
          {snapshot.owner}
        </span>
        <span className="k">EPOCH / REVISION</span>
        <span className="v">
          e{snapshot.epoch} r{snapshot.revision}
        </span>
      </div>

      <div className="rail-left__spacer" />

      <div className="rail-left__meta" aria-hidden>
        {stationTag}
        {'\n'}
        1 CR = 0.001 NEAR{'\n'}
        {isPractice ? 'PRACTICE — NO CHAIN STATE' : `EPOCH ${snapshot.epoch} · CAMPAIGN ${snapshot.campaignId}`}
      </div>
    </aside>
  )
}

function stationNameFrom(snapshot: GameSnapshot): string {
  if (snapshot.stationAccount.startsWith('station.practice')) return 'RELAY-07'
  const slug = snapshot.stationAccount.split('.')[0] ?? snapshot.stationAccount
  return slug.toUpperCase().slice(0, 12) || 'STATION'
}
