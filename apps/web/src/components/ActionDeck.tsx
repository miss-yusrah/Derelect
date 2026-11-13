import { CAMPAIGN_TURNS, FUEL_CAPACITY, HULL_CAPACITY, REPAIR_COST } from '@derelict/game-model'
import {
  blockerText,
  describeAction,
  type ActionDeckState,
  type CardEffect,
  type CardView,
} from '../lib/actionDeck'
import { TRAFFIC_ESCROW_YOCTO } from '../lib/factory'
import { cr, crDelta, countDelta, shortAccount } from '../lib/format'
import type { GameSnapshot } from '../lib/state'
import type { StationState, ActionKind } from '@derelict/game-model'
import { ActionIcon, IconWarning, IconWrench } from './icons'

type TxKind = 'act' | 'list' | 'unlist' | 'purchase' | 'claimRepair' | 'seed'

export interface ActionDeckProps {
  deck: ActionDeckState
  snapshot: GameSnapshot
  previewState: StationState
  walletAccount: string | null
  isCaptain: boolean
  /** Captain's station has no visiting ships funded for this campaign yet. */
  needsTraffic: boolean
  /** The connected wallet is the recorded repair supplier with an unpaid fee. */
  canClaimRepair: boolean
  txPending: TxKind | null
  onPlay: (action: ActionKind) => void
  onClaimRepair: () => void
  onSeedTraffic: () => void
  onConnectWallet: () => void
  onOpenMarket: () => void
  onOpenStations: () => void
  onShowResult: () => void
}

/** Your hand of six work orders and the panel where you sign the chosen one. */
export function ActionDeck(props: ActionDeckProps) {
  const { deck, snapshot, txPending } = props
  const busy = txPending !== null

  if (snapshot.complete) {
    return (
      <section className="deck deck--done" aria-label="Campaign result">
        <CampaignClosed {...props} />
      </section>
    )
  }

  return (
    <section className="deck" aria-label="Your move">
      <div className="hand" role="radiogroup" aria-label="Actions for this turn">
        {deck.cards.map((card) => (
          <Card
            key={card.key}
            card={card}
            selected={card.key === deck.selectedKind}
            disabled={busy}
            onSelect={() => deck.select(card.key)}
          />
        ))}
      </div>
      <SignPanel {...props} />
    </section>
  )
}

/* ------------------------------------------------------------------ */

function Card({
  card,
  selected,
  disabled,
  onSelect,
}: {
  card: CardView
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const playable = card.preview.ok
  const tone = card.creditsYocto > 0n ? 'gain' : card.creditsYocto < 0n ? 'cost' : 'free'
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`card${selected ? ' card--selected' : ''}${playable ? '' : ' card--blocked'}`}
      disabled={disabled}
      onClick={onSelect}
      aria-describedby={`card-${card.key}-foot`}
    >
      <span className="card__head">
        <ActionIcon kind={card.key} size={18} />
        <span className="card__title">{card.title}</span>
      </span>
      <span className={`card__credits card__credits--${tone}`}>
        {tone === 'free' ? 'Free' : crDelta(card.creditsYocto)}
        {tone === 'free' ? null : <span className="card__unit">Cr</span>}
      </span>
      <span className="card__effects">
        {card.effects.map((effect) => (
          <EffectChip key={effect.label} effect={effect} />
        ))}
      </span>
      <span className="card__foot" id={`card-${card.key}-foot`}>
        {playable ? card.hint : blockerText(card.preview.error)}
      </span>
    </button>
  )
}

function EffectChip({ effect }: { effect: CardEffect }) {
  const plural = Math.abs(effect.delta) === 1 || effect.label === 'fuel' || effect.label === 'hull' ? '' : 's'
  return (
    <span
      className={`chip ${effect.delta < 0 ? (effect.label === 'hull' ? 'chip--damage' : 'chip--cost') : 'chip--gain'}${effect.later ? ' chip--later' : ''}`}
    >
      {countDelta(effect.delta)} {effect.label}
      {plural}
      {effect.later ? ' later' : ''}
    </span>
  )
}

/* ------------------------------------------------------------------ */

function SignPanel({
  deck,
  snapshot,
  previewState,
  walletAccount,
  isCaptain,
  needsTraffic,
  canClaimRepair,
  txPending,
  onPlay,
  onClaimRepair,
  onSeedTraffic,
  onConnectWallet,
  onOpenMarket,
  onOpenStations,
}: ActionDeckProps) {
  const busy = txPending !== null
  const card = deck.selectedCard
  const preview = deck.preview
  const turn = Math.min(snapshot.turn, CAMPAIGN_TURNS)

  const supplierClaim = canClaimRepair ? (
    <div className="sign__notice">
      <IconWrench size={15} />
      <span>
        You are this station’s repair supplier. The {cr(REPAIR_COST)} Cr reserve is yours to claim, whoever
        owns the station.
      </span>
      <button className={`btn btn--small ${isCaptain ? 'btn--outline' : 'btn--primary'}`} disabled={busy} onClick={onClaimRepair}>
        {txPending === 'claimRepair' ? 'Claiming…' : 'Claim fee'}
      </button>
    </div>
  ) : null

  if (needsTraffic) {
    return (
      <div className="sign">
        <h2 className="sign__title">Fund visitor traffic</h2>
        <p className="sign__desc">
          Before turn 1, no ships have prepaid, so nothing can dock. Fund the 12 visiting ships — 6 standard and 6
          heavy — in one approval. The station holds the escrow, and anything unused stays refundable to you.
        </p>
        <button className="btn btn--primary btn--block" disabled={busy} onClick={onSeedTraffic}>
          {txPending === 'seed' ? 'Approve in your wallet…' : `Fund 12 ships · ${cr(TRAFFIC_ESCROW_YOCTO)} Cr`}
        </button>
      </div>
    )
  }

  if (!card || !preview) return <div className="sign" />

  const forecast = deck.forecast
  const effectLine = forecast ? (
    <dl className="sign__effects">
      {forecast.creditsYocto !== 0n ? (
        <Change label="Treasury" from={cr(snapshot.operatingYocto)} to={cr(snapshot.operatingYocto + forecast.creditsYocto)} unit="Cr" />
      ) : null}
      {forecast.fuel !== 0 ? <Change label="Fuel" from={snapshot.fuel} to={snapshot.fuel + forecast.fuel} max={FUEL_CAPACITY} /> : null}
      {forecast.hull !== 0 ? <Change label="Hull" from={snapshot.hull} to={snapshot.hull + forecast.hull} max={HULL_CAPACITY} /> : null}
      {forecast.hullLater !== 0 ? (
        <Change label="Hull, next turn" from={snapshot.hull} to={Math.min(snapshot.hull + forecast.hullLater, HULL_CAPACITY)} max={HULL_CAPACITY} />
      ) : null}
      {forecast.served !== 0 ? <Change label="Ships" from={snapshot.served} to={snapshot.served + forecast.served} /> : null}
      {forecast.creditsYocto === 0n && forecast.fuel === 0 && forecast.hull === 0 && forecast.hullLater === 0 && forecast.served === 0 ? (
        <div className="change">
          <dt>Station</dt>
          <dd>No change</dd>
        </div>
      ) : null}
    </dl>
  ) : (
    <p className="sign__blocked">
      <IconWarning size={15} />
      <span>{card.key === 'commissionRepair' && preview.error?.startsWith('Enter') ? preview.error : blockerText(preview.error)}</span>
    </p>
  )

  const inputs =
    deck.selectedKind === 'refuel' ? (
      <div className="field">
        <span className="field__label" id="refuel-units">
          Units
        </span>
        <div className="stepper" role="radiogroup" aria-labelledby="refuel-units">
          {[1, 2, 3, 4].map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={deck.refuelUnits === u}
              className={`stepper__opt${deck.refuelUnits === u ? ' stepper__opt--on' : ''}`}
              disabled={busy}
              onClick={() => deck.setRefuelUnits(u)}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
    ) : deck.selectedKind === 'commissionRepair' ? (
      <div className="field">
        <label className="field__label" htmlFor="supplier-field">
          Supplier
        </label>
        <input
          id="supplier-field"
          className="input"
          type="text"
          value={deck.supplier}
          onChange={(e) => deck.setSupplier(e.target.value)}
          placeholder="supplier.testnet"
          spellCheck={false}
          autoComplete="off"
          disabled={busy}
        />
      </div>
    ) : null

  let primary
  let note
  if (!walletAccount) {
    primary = (
      <button className="btn btn--primary btn--block" onClick={onConnectWallet}>
        Connect wallet to play
      </button>
    )
    note = 'You are viewing this station read-only. Connect a NEAR testnet wallet, then launch a station you command.'
  } else if (!isCaptain) {
    primary = (
      <button className="btn btn--primary btn--block" onClick={onOpenStations}>
        Launch your own station
      </button>
    )
    note = (
      <>
        Only the captain, <span className="mono">{shortAccount(snapshot.owner, 26)}</span>, can play this station.{' '}
        <button className="linkbtn" onClick={onOpenMarket}>
          {snapshot.listingYocto !== null ? `It is for sale at ${cr(snapshot.listingYocto)} Cr.` : 'See its papers.'}
        </button>
      </>
    )
  } else {
    primary = (
      <button
        className={`btn btn--primary btn--block${txPending === 'act' ? ' is-busy' : ''}`}
        disabled={!preview.ok || busy}
        aria-busy={txPending === 'act'}
        onClick={() => onPlay(deck.action)}
      >
        {txPending === 'act' ? (
          'Approve in your wallet…'
        ) : (
          <>
            Sign turn {turn}
            <span className="sign__go-card"> · {card.title}</span>
          </>
        )}
      </button>
    )
    note =
      txPending === 'act'
        ? 'Signed moves land when the chain confirms them — usually a few seconds.'
        : turn === CAMPAIGN_TURNS
          ? 'Last turn: your score is the treasury after this move.'
          : 'Your wallet asks you to approve. The station updates once the chain confirms.'
  }

  return (
    <div className="sign" aria-live="polite">
      {supplierClaim}
      <h2 className="sign__title">
        <ActionIcon kind={card.key} size={20} />
        {card.title}
      </h2>
      <p className="sign__desc">{describeAction(card.key, previewState)}</p>
      {inputs}
      {effectLine}
      <div className="sign__go">{primary}</div>
      <p className="sign__note">{note}</p>
    </div>
  )
}

function Change({
  label,
  from,
  to,
  max,
  unit,
}: {
  label: string
  from: number | string
  to: number | string
  max?: number
  unit?: string
}) {
  const up = Number(String(to).replace('−', '-')) > Number(String(from).replace('−', '-'))
  const tone = up ? 'is-gain' : label.startsWith('Hull') ? 'is-damage' : 'is-spend'
  return (
    <div className="change">
      <dt>{label}</dt>
      <dd>
        <span className="change__from">{from}</span>
        <span className="change__arrow" aria-label="becomes">
          →
        </span>
        <span className={`change__to ${tone}`}>{to}</span>
        {max !== undefined ? <span className="change__max">/{max}</span> : null}
        {unit ? <span className="change__max"> {unit}</span> : null}
      </dd>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function CampaignClosed({
  snapshot,
  walletAccount,
  isCaptain,
  canClaimRepair,
  txPending,
  onClaimRepair,
  onConnectWallet,
  onOpenMarket,
  onOpenStations,
  onShowResult,
}: ActionDeckProps) {
  const won = snapshot.outcome.success
  return (
    <div className="closed">
      <div className="closed__verdict">
        <span className={`closed__stamp ${won ? 'closed__stamp--won' : 'closed__stamp--lost'}`}>
          {won ? 'Salvage successful' : 'Station lost'}
        </span>
        <p className="closed__reason">{snapshot.outcome.reason ?? 'Six turns complete.'}</p>
      </div>
      <dl className="closed__stats">
        <div>
          <dt>Final treasury</dt>
          <dd>
            {cr(snapshot.operatingYocto)}
            <span className="closed__unit">Cr</span>
          </dd>
        </div>
        <div>
          <dt>Ships served</dt>
          <dd>{snapshot.served}</dd>
        </div>
        <div>
          <dt>Hull</dt>
          <dd>
            {snapshot.hull}
            <span className="closed__unit">/{HULL_CAPACITY}</span>
          </dd>
        </div>
      </dl>
      <div className="closed__actions">
        {canClaimRepair ? (
          <button className="btn btn--primary" disabled={txPending !== null} onClick={onClaimRepair}>
            {txPending === 'claimRepair' ? 'Claiming…' : 'Claim repair fee'}
          </button>
        ) : (
          <button className="btn btn--primary" onClick={walletAccount ? onOpenStations : onConnectWallet}>
            {walletAccount ? 'Launch a new station' : 'Connect wallet to play'}
          </button>
        )}
        <button className="btn btn--outline" onClick={onShowResult}>
          Full results
        </button>
        <button className="btn btn--outline" onClick={onOpenMarket}>
          {isCaptain ? 'List for sale' : snapshot.listingYocto !== null ? 'Buy this station' : 'Station papers'}
        </button>
      </div>
    </div>
  )
}
