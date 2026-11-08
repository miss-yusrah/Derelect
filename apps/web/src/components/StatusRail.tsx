import type { GameSnapshot } from '../lib/state'
import { formatCredits } from '@derelict/game-model'
import { FUEL_CAPACITY, HULL_CAPACITY } from '@derelict/game-model'
import { IconCredits, IconFuel, IconHull, IconLock } from './icons'
import { Gauge, StatRow } from './primitives'
import { PRACTICE_BUYER } from '../config'

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
  const reserved = snapshot.repairDueTurn !== null && !snapshot.repairPaid
    ? 4000000000000000000000n
    : 0n

  return (
    <aside className="rail-left" aria-label="Station status">
      <div>
        <div className="rail-left__title">STATION</div>
        <div className="rail-left__name">
          {stationNameFrom(snapshot)}
          <small>{isPractice ? 'PRACTICE STATION — LOCAL MODEL' : 'ORBITAL SALVAGE STATION'}</small>
        </div>
      </div>

      <Gauge
        icon={<IconFuel size={17} />}
        label="FUEL"
        value={String(snapshot.fuel)}
        cells={snapshot.fuel}
        cellCount={FUEL_CAPACITY}
        flashIndex={fuelFlashCell}
        danger={snapshot.fuel <= 1}
      />
      <Gauge
        icon={<IconHull size={17} />}
        label="HULL"
        value={String(snapshot.hull)}
        cells={snapshot.hull}
        cellCount={HULL_CAPACITY}
        danger={snapshot.hull === 1}
      />

      <div>
        <StatRow
          icon={<IconCredits size={17} />}
          label="OPERATING"
          amount={operating}
          unit="Cr"
          title="Unprotected operating funds (station money; the score)"
        />
        <StatRow
          icon={<IconLock size={17} />}
          label="PROTECTED REPAIR"
          amount={formatCredits(reserved)}
          unit="Cr"
          title="Reserved for the commissioned repair; creditors keep their claim"
        />
        <StatRow
          icon={null}
          label="VISITOR ESCROW"
          amount={formatCredits(snapshot.visitorsEscrowYocto)}
          unit="Cr"
          title="Prepaid offers held for visiting ships"
        />
      </div>

      <div className="rail-left__captain">
        <span className="k">CAPTAIN (NFT OWNER)</span>
        <span className="v" title={snapshot.owner}>
          {snapshot.owner}
        </span>
        <span className="k">EP / REV</span>
        <span className="v">
          e{snapshot.epoch} r{snapshot.revision}
        </span>
      </div>

      <div className="rail-left__spacer" />

      <div className="rail-left__meta" aria-hidden>
        {stationTag}
        {'\n'}
        SALVAGE {'//'} REPAIR {'//'} TRADE{'\n'}
        1 CR = 0.001 NEAR{'\n'}
        {isPractice ? `PRACTICE SELLER ${PRACTICE_BUYER}` : `BLOCK #{CHAIN}`}
      </div>
    </aside>
  )
}

function stationNameFrom(snapshot: GameSnapshot): string {
  if (snapshot.stationAccount.startsWith('station.practice')) return 'RELAY-07'
  const slug = snapshot.stationAccount.split('.')[0] ?? snapshot.stationAccount
  return slug.toUpperCase().slice(0, 12) || 'STATION'
}
