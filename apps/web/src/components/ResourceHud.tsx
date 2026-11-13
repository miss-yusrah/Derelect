import { CREDIT, FUEL_CAPACITY, HULL_CAPACITY } from '@derelict/game-model'
import type { DeckForecast } from '../lib/actionDeck'
import { cr, countDelta, shortAccount } from '../lib/format'
import type { GameSnapshot } from '../lib/state'
import { IconCheck, IconLock } from './icons'
import { Pips } from './primitives'

export interface ResourceHudProps {
  snapshot: GameSnapshot
  /** What the selected card would change; null when it cannot be played. */
  forecast: DeckForecast | null
  /** A confirmed ownership change to animate (previous captain), or null. */
  ownerSwap?: { previous: string; key: number } | null
}

const WIN_SHIPS = 3
const REPAIR_RESERVE = 4n * CREDIT

/** The station's papers: what it holds, what it owes, and who commands it. */
export function ResourceHud({ snapshot: s, forecast, ownerSwap = null }: ResourceHudProps) {
  const f = s.complete ? null : forecast
  const repairHeld = s.repairDueTurn !== null && !s.repairPaid
  const creditsAfter = f && f.creditsYocto !== 0n ? s.operatingYocto + f.creditsYocto : null

  return (
    <section className="papers" aria-label="Station papers">
      <div className="papers__treasury">
        <span className="papers__label">Treasury</span>
        <span className="papers__value" aria-label={`${cr(s.operatingYocto)} credits`}>
          {cr(s.operatingYocto)}
          <span className="papers__unit">Cr</span>
          {creditsAfter !== null ? (
            <span className={`papers__after ${f && f.creditsYocto > 0n ? 'is-gain' : 'is-spend'}`}>
              <span aria-hidden="true">→</span> {cr(creditsAfter)}
            </span>
          ) : null}
        </span>
        <span className="papers__note">{s.complete ? 'Final score' : 'Score = treasury after turn 6'}</span>
      </div>

      <Meter
        label="Fuel"
        value={s.fuel}
        max={FUEL_CAPACITY}
        delta={f?.fuel ?? 0}
        tone={s.fuel <= 1 ? 'low' : 'normal'}
        note={s.fuel === 0 ? 'Empty — refuel to dock' : undefined}
      />
      <Meter
        label="Hull"
        value={s.hull}
        max={HULL_CAPACITY}
        delta={f?.hull ?? 0}
        later={f?.hullLater ?? 0}
        damage
        tone={s.hull <= 1 ? 'danger' : 'normal'}
        note={
          s.hull === 0
            ? 'Breached — docking disabled'
            : s.hull === 1
              ? 'Must stay above 0 to win'
              : repairHeld && !s.repairApplied && s.repairDueTurn !== null
                ? `+2 after turn ${s.repairDueTurn}`
                : undefined
        }
      />
      <Meter
        label="Ships served"
        shortLabel="Ships"
        value={Math.min(s.served, WIN_SHIPS)}
        max={WIN_SHIPS}
        delta={f?.served ?? 0}
        display={String(s.served)}
        tone={s.served >= WIN_SHIPS ? 'met' : 'normal'}
        note={s.served >= WIN_SHIPS ? 'Win condition met' : `${WIN_SHIPS} needed to win`}
      />

      <dl className="papers__held">
        <div className="papers__heldhead">Held by the station</div>
        <div className={`held${repairHeld ? ' held--active' : ''}`} title="Set aside for the repair supplier; it survives a sale">
          <dt>
            <IconLock size={13} /> Repair reserve
          </dt>
          <dd>
            {repairHeld ? `${cr(REPAIR_RESERVE)} Cr` : 'None'}
            {repairHeld && s.repairSupplier ? (
              <span className="held__sub">
                {s.repairApplied ? 'Hull restored · ' : ''}owed to {shortAccount(s.repairSupplier, 20)}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="held" title="Prepaid by visiting ships; pays docking fees and stays refundable">
          <dt>Visitor escrow</dt>
          <dd>{cr(s.visitorsEscrowYocto)} Cr</dd>
        </div>
        {s.listingYocto !== null ? (
          <div className="held held--sale">
            <dt>Listed for sale</dt>
            <dd>{cr(s.listingYocto)} Cr</dd>
          </div>
        ) : null}
      </dl>

      <div className="papers__captain">
        <span className="papers__label">Captain</span>
        <span className="captain-badge" title={s.owner}>
          {ownerSwap ? (
            <span className="captain-badge__out" key={`out-${ownerSwap.key}`} aria-hidden="true">
              {shortAccount(ownerSwap.previous, 30)}
            </span>
          ) : null}
          <span className={ownerSwap ? 'captain-badge__in' : undefined} key={`in-${ownerSwap?.key ?? 0}`}>
            <span className="captain-badge__full">{shortAccount(s.owner, 30)}</span>
            <span className="captain-badge__short">{shortAccount(s.owner, 20)}</span>
          </span>
        </span>
      </div>
    </section>
  )
}

function Meter({
  label,
  shortLabel,
  value,
  max,
  delta,
  later = 0,
  damage = false,
  tone,
  note,
  display,
}: {
  label: string
  /** Label used on phones, where three meters share a row. */
  shortLabel?: string
  /** Losses here are damage (oxide), not spending. */
  damage?: boolean
  value: number
  max: number
  delta: number
  later?: number
  tone: 'normal' | 'low' | 'danger' | 'met'
  note?: string
  display?: string
}) {
  const shown = display ?? String(value)
  const change = delta !== 0 ? countDelta(delta) : later !== 0 ? `${countDelta(later)} later` : null
  return (
    <div className={`meter meter--${tone}`} role="group" aria-label={`${label}: ${shown} of ${max}${note ? `. ${note}` : ''}`}>
      <div className="meter__head">
        <span className="papers__label">
          {shortLabel ? (
            <>
              <span className="meter__long">{label}</span>
              <span className="meter__short">{shortLabel}</span>
            </>
          ) : (
            label
          )}
        </span>
        {change ? (
          <span className={`meter__change ${delta < 0 ? (damage ? 'is-damage' : 'is-spend') : 'is-gain'}`}>{change}</span>
        ) : null}
        <span className="meter__value">
          {tone === 'met' ? <IconCheck size={14} className="meter__check" /> : null}
          {shown}
          <span className="meter__max">/{max}</span>
        </span>
      </div>
      <Pips value={value} max={max} delta={delta} later={later} tone={tone} damage={damage} />
      {note ? <span className="meter__note">{note}</span> : null}
    </div>
  )
}
