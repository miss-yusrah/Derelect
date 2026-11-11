import type {
  ActionKind,
  CampaignOutcome,
  Offer,
  StationState,
} from '@derelict/game-model'
import type { ChainBuckets, ChainLedgerEvent, ChainOffer, ChainState } from './contract'

/**
 * Faithful game snapshot derived from the station contract's views.
 * bigint money is yoctoNEAR.
 */

export interface GameSnapshot {
  stationAccount: string
  owner: string
  campaignId: number
  /** 1-based next turn; complete when turn > 6. */
  turn: number
  complete: boolean
  fuel: number
  hull: number
  served: number
  upgrade: boolean
  operatingYocto: bigint
  listingYocto: bigint | null
  revision: number
  epoch: number
  repairDueTurn: number | null
  repairPaid: boolean
  repairApplied: boolean
  repairSupplier: string | null
  outcome: CampaignOutcome
  visitorsEscrowYocto: bigint
  sellerReceivableYocto: bigint
}

export interface LedgerRow {
  /** 1-based source ordering: 1 is the oldest entry. */
  sequence: number
  turn: number
  kind: string
  text: string
  deltaYocto: bigint
  revision: number | null
  block: number | null
}

export type LedgerFilter = 'all' | 'actions' | 'money' | 'ownership'

export const GAMEPLAY_KINDS = new Set([
  'standardDocking',
  'heavyDocking',
  'refuel',
  'commissionRepair',
  'upgradeDock',
  'wait',
  'repairEffect',
])

export const OWNERSHIP_KINDS = new Set([
  'sale',
  'transfer',
  'transferCall',
  'transferCallReverted',
  'transferCallForwarded',
])

export const MONEY_KINDS = new Set([
  'fundOffer',
  'claimRepair',
  'claimProceeds',
  'claimRefund',
  'payoutPaid',
  'payoutFailed',
  'list',
  'unlist',
])

export function ledgerKindOf(kind: string): LedgerFilter {
  if (GAMEPLAY_KINDS.has(kind)) return 'actions'
  if (MONEY_KINDS.has(kind)) return 'money'
  if (OWNERSHIP_KINDS.has(kind)) return 'ownership'
  return 'all'
}

/** Short action headline for timelines/result table. */
export function actionLabel(action: ActionKind | string): string {
  if (typeof action !== 'string') {
    switch (action.kind) {
      case 'standardDocking':
        return 'Standard docking'
      case 'heavyDocking':
        return 'Heavy docking'
      case 'refuel':
        return `Refuel ${action.units}`
      case 'commissionRepair':
        return 'Commission repair'
      case 'upgradeDock':
        return 'Upgrade dock'
      case 'wait':
        return 'Wait'
    }
  }
  switch (action) {
    case 'standardDocking':
      return 'Standard docking'
    case 'heavyDocking':
      return 'Heavy docking'
    case 'upgradeDock':
      return 'Upgrade dock'
    case 'wait':
      return 'Wait'
    case 'refuel':
      return 'Refuel'
    case 'commissionRepair':
      return 'Commission repair'
    case 'repairEffect':
      return 'Repair effect'
    default:
      return action
  }
}

/* ------------------------------------------------------------------ */
/* Chain mapping                                                       */
/* ------------------------------------------------------------------ */

export function snapshotFromChain(
  s: ChainState,
  buckets: ChainBuckets,
): GameSnapshot {
  return {
    stationAccount: s.station_account,
    owner: s.owner,
    campaignId: s.campaign_id,
    turn: s.turn,
    complete: s.complete,
    fuel: s.fuel,
    hull: s.hull,
    served: s.served,
    upgrade: s.upgrade,
    operatingYocto: BigInt(s.operating),
    listingYocto: s.listing === null ? null : BigInt(s.listing),
    revision: s.revision,
    epoch: s.epoch,
    repairDueTurn: s.repair ? s.repair.due_turn : null,
    repairPaid: s.repair?.paid ?? false,
    repairApplied: s.repair?.effect_applied ?? false,
    repairSupplier: s.repair ? s.repair.supplier : null,
    outcome: {
      complete: s.outcome.complete,
      success: s.outcome.success,
      reason: s.outcome.reason ?? undefined,
      scoreYocto: s.outcome.score === null ? (s.outcome.complete ? BigInt(s.operating) : null) : BigInt(s.outcome.score),
    },
    visitorsEscrowYocto: BigInt(buckets.visitor_escrow_refundable),
    sellerReceivableYocto: BigInt(buckets.seller_receivable),
  }
}

export function ledgerRowsFromChain(events: ChainLedgerEvent[]): LedgerRow[] {
  return events.map((event, i) => ({
    sequence: i + 1,
    turn: event.turn,
    kind: event.kind,
    text: event.text,
    deltaYocto: BigInt(event.operating_delta),
    revision: event.revision,
    block: event.block_height,
  }))
}

export function chainOfferToModel(o: ChainOffer): Offer {
  return {
    id: o.id,
    kind: o.kind,
    payer: o.payer,
    campaignId: o.campaign_id,
    escrowYocto: BigInt(o.escrow_amount),
    expiryBlock: BigInt(o.expiry_block),
    used: o.used,
    refunded: o.refunded,
  }
}

/**
 * Synthesize a full model `StationState` from chain views so
 * `previewActionAtBlock` reproduces exactly the on-chain validation.
 */
export function previewStateFromChain(
  snapshot: GameSnapshot,
  offers: Offer[],
): StationState {
  const repairReserve =
    snapshot.repairDueTurn !== null && !snapshot.repairPaid ? 4000000000000000000000n : 0n
  return {
    stationAccountId: snapshot.stationAccount,
    tokenId: 'station',
    owner: snapshot.owner,
    campaignId: snapshot.campaignId,
    revision: snapshot.revision,
    epoch: snapshot.epoch,
    turn: snapshot.turn,
    operatingYocto: snapshot.operatingYocto,
    fuel: snapshot.fuel,
    hull: snapshot.hull,
    served: snapshot.served,
    upgrade: snapshot.upgrade,
    repair:
      snapshot.repairDueTurn === null
        ? null
        : {
            id: 1,
            supplier: snapshot.repairSupplier ?? '',
            reserveYocto: repairReserve,
            campaignId: snapshot.campaignId,
            dueTurn: snapshot.repairDueTurn,
            eligibleBlock: 0n,
            effectApplied: snapshot.repairApplied,
            effectTurn: snapshot.repairApplied ? snapshot.repairDueTurn : null,
            paid: snapshot.repairPaid,
          },
    offers,
    listing: snapshot.listingYocto === null ? null : { priceYocto: snapshot.listingYocto },
    sellerReceivables: snapshot.sellerReceivableYocto ? { previous: snapshot.sellerReceivableYocto } : {},
    visitorRefundable: {},
    history: [],
  }
}
