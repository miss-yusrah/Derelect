import {
  ActionPreview,
  ActionKind,
  CampaignOutcome,
  HistoryEvent,
  Offer,
  Repair,
  StarterConfig,
  StationState,
  CREDIT,
  CAMPAIGN_TURNS,
  FUEL_CAPACITY,
  HULL_CAPACITY,
  HEAVY_FEE,
  REFUEL_UNIT_COST,
  REPAIR_COST,
  STANDARD_FEE,
  STANDARD_FEE_UPGRADED,
  SUPPLIER_ELIGIBLE_AFTER_BLOCKS,
  UPGRADE_COST,
} from './types.js';
import type { StrategyStep } from './fixtures.js';
import { formatCredits } from './format.js';

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionError';
  }
}

export type { StationState, StrategyStep };

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

export const STANDARD_SALVAGE: StarterConfig = {
  operatingYocto: 10n * CREDIT,
  fuel: 4,
  hull: 2,
  standardOffers: 6,
  heavyOffers: 6,
  visitorPayer: 'visitor.derelict.testnet',
};

/** Create a fresh station in the standard salvage scenario. */
export function createStation(
  stationAccountId: string,
  owner: string,
  starter: StarterConfig = STANDARD_SALVAGE,
  startBlock: bigint = 1n,
): StationState {
  const offers: Offer[] = [];
  let id = 1;
  for (let i = 0; i < starter.standardOffers; i++) {
    // A standard offer escrows the maximum fee: 5 credits.
    offers.push({
      id: id++,
      kind: 'standard',
      payer: starter.visitorPayer,
      campaignId: 1,
      escrowYocto: STANDARD_FEE_UPGRADED,
      expiryBlock: startBlock + 500n,
      used: false,
      refunded: false,
    });
  }
  for (let i = 0; i < starter.heavyOffers; i++) {
    offers.push({
      id: id++,
      kind: 'heavy',
      payer: starter.visitorPayer,
      campaignId: 1,
      escrowYocto: HEAVY_FEE,
      expiryBlock: startBlock + 500n,
      used: false,
      refunded: false,
    });
  }

  const state: StationState = {
    stationAccountId,
    tokenId: 'station',
    owner,
    campaignId: 1,
    revision: 1,
    epoch: 1,
    turn: 1,
    operatingYocto: starter.operatingYocto,
    fuel: starter.fuel,
    hull: starter.hull,
    served: 0,
    upgrade: false,
    repair: null,
    offers,
    listing: null,
    sellerReceivables: {},
    visitorRefundable: {},
    history: [],
  };

  state.history.push(
    event(
      0,
      'init',
      `Station created; captain ${owner}; ${formatCredits(starter.operatingYocto)} Cr opening funds, fuel ${starter.fuel}, hull ${starter.hull}`,
      0n,
    ),
  );
  return state;
}

function event(
  turn: number,
  kind: string,
  text: string,
  operatingDeltaYocto: bigint,
): HistoryEvent {
  return { turn, kind, text, operatingDeltaYocto };
}

function bump(state: StationState, ev: HistoryEvent): void {
  state.revision += 1;
  state.history.push(ev);
}

/* ------------------------------------------------------------------ */
/* Action eligibility                                                  */
/* ------------------------------------------------------------------ */

export function isCampaignComplete(state: StationState): boolean {
  return state.turn > CAMPAIGN_TURNS;
}

/** Best currently eligible funded offer for a docking action, or null. */
export function bestEligibleOffer(
  state: StationState,
  kind: Offer['kind'],
): Offer | null {
  let best: Offer | null = null;
  for (const o of state.offers) {
    if (o.kind === kind && !o.used && !o.refunded && o.campaignId === state.campaignId) {
      if (best === null || o.id < best.id) best = o;
    }
  }
  return best;
}

/** Preview an action with the same rules as on-chain validation. */
export function previewActionAtBlock(
  state: StationState,
  action: ActionKind,
  currentBlock: bigint,
): ActionPreview {
  const base = {
    operatingCostYocto: 0n,
    operatingGainYocto: 0n,
    fuelDelta: 0,
    hullDelta: 0,
    turnsPlayed: 0,
  };
  if (isCampaignComplete(state)) {
    return { ok: false, error: 'Campaign already complete', ...base, text: 'No turns remain' };
  }
  switch (action.kind) {
    case 'standardDocking': {
      if (state.hull < 1) {
        return {
          ok: false,
          error: 'Hull is 0; docking is disabled until repaired',
          ...base,
          text: 'Docking disabled at hull 0',
        };
      }
      if (state.fuel < 1) {
        return { ok: false, error: 'Not enough fuel (needs 1)', ...base, text: 'Insufficient fuel' };
      }
      const offer = bestEligibleOffer(state, 'standard');
      if (!offer) {
        return { ok: false, error: 'No eligible prepaid standard offer', ...base, text: 'No funded standard offer' };
      }
      const fee = state.upgrade ? STANDARD_FEE_UPGRADED : STANDARD_FEE;
      return {
        ok: true,
        operatingCostYocto: 0n,
        operatingGainYocto: fee,
        fuelDelta: -1,
        hullDelta: 0,
        turnsPlayed: 1,
        text: `Standard docking: cost 1 fuel, earn ${formatCredits(fee)} Cr, serve 1 ship`,
      };
    }
    case 'heavyDocking': {
      if (state.hull < 1) {
        return {
          ok: false,
          error: 'Hull is 0; docking is disabled until repaired',
          ...base,
          text: 'Docking disabled at hull 0',
        };
      }
      if (state.fuel < 2) {
        return { ok: false, error: 'Not enough fuel (needs 2)', ...base, text: 'Insufficient fuel' };
      }
      // Reducing hull from 1 to 0 is permitted; docking is disabled at 0.
      const offer = bestEligibleOffer(state, 'heavy');
      if (!offer) {
        return { ok: false, error: 'No eligible prepaid heavy offer', ...base, text: 'No funded heavy offer' };
      }
      return {
        ok: true,
        operatingCostYocto: 0n,
        operatingGainYocto: HEAVY_FEE,
        fuelDelta: -2,
        hullDelta: -1,
        turnsPlayed: 1,
        text: `Heavy docking: cost 2 fuel and 1 hull, earn ${formatCredits(HEAVY_FEE)} Cr, serve 1 ship`,
      };
    }
    case 'refuel': {
      const units = action.units;
      if (!Number.isInteger(units) || units < 1 || units > 4) {
        return { ok: false, error: 'Refuel 1 to 4 units', ...base, text: 'Refuel 1–4 units' };
      }
      if (state.fuel + units > FUEL_CAPACITY) {
        return {
          ok: false,
          error: `Fuel capacity is ${FUEL_CAPACITY}`,
          ...base,
          text: `Refuel exceeds capacity ${FUEL_CAPACITY}`,
        };
      }
      const cost = REFUEL_UNIT_COST * BigInt(units);
      if (state.operatingYocto < cost) {
        return { ok: false, error: `Insufficient operating funds (needs ${formatCredits(cost)} Cr)`, ...base, text: 'Insufficient operating funds' };
      }
      return {
        ok: true,
        operatingCostYocto: cost,
        operatingGainYocto: 0n,
        fuelDelta: units,
        hullDelta: 0,
        turnsPlayed: 1,
        text: `Refuel ${units} units, cost ${formatCredits(cost)} Cr, fuel ${state.fuel} to ${state.fuel + units}`,
      };
    }
    case 'commissionRepair': {
      if (state.repair) {
        return { ok: false, error: 'One active repair at a time', ...base, text: 'Repair already active' };
      }
      if (state.hull >= HULL_CAPACITY) {
        return { ok: false, error: `Hull already at capacity ${HULL_CAPACITY}`, ...base, text: 'Hull already full' };
      }
      if (state.turn >= CAMPAIGN_TURNS) {
        return { ok: false, error: 'Cannot commission a repair on turn 6', ...base, text: 'Too late for repair' };
      }
      if (state.operatingYocto < REPAIR_COST) {
        return { ok: false, error: `Insufficient operating funds (needs ${formatCredits(REPAIR_COST)} Cr)`, ...base, text: 'Insufficient operating funds' };
      }
      if (!action.supplier) {
        return { ok: false, error: 'Repair requires a supplier account', ...base, text: 'Missing supplier' };
      }
      return {
        ok: true,
        operatingCostYocto: REPAIR_COST,
        operatingGainYocto: 0n,
        fuelDelta: 0,
        hullDelta: 0,
        turnsPlayed: 1,
        text: `Commission repair: reserve ${formatCredits(REPAIR_COST)} Cr, restores ${Math.min(2, HULL_CAPACITY - state.hull)} hull after the next action; supplier ${action.supplier}`,
      };
    }
    case 'upgradeDock': {
      if (state.upgrade) {
        return { ok: false, error: 'Dock already upgraded (one per campaign)', ...base, text: 'Already upgraded' };
      }
      if (state.operatingYocto < UPGRADE_COST) {
        return { ok: false, error: `Insufficient operating funds (needs ${formatCredits(UPGRADE_COST)} Cr)`, ...base, text: 'Insufficient operating funds' };
      }
      return {
        ok: true,
        operatingCostYocto: UPGRADE_COST,
        operatingGainYocto: 0n,
        fuelDelta: 0,
        hullDelta: 0,
        turnsPlayed: 1,
        text: `Upgrade dock: cost ${formatCredits(UPGRADE_COST)} Cr; standard docking now earns ${formatCredits(STANDARD_FEE_UPGRADED)} Cr`,
      };
    }
    case 'wait':
      return {
        ok: true,
        ...base,
        turnsPlayed: 1,
        text: 'Wait: advance the turn; a due repair effect may arrive',
      };
  }
}

/* ------------------------------------------------------------------ */
/* Transitions                                                         */
/* ------------------------------------------------------------------ */

/**
 * Validate and apply a captain gameplay action. Throws ActionError when the
 * action is invalid; a failed action changes nothing and consumes no turn.
 */
export function applyAction(
  state: StationState,
  action: ActionKind,
  currentBlock: bigint,
): StationState {
  // ActionError thrown by preview keeps validation identical.
  const pv = previewActionAtBlock(state, action, currentBlock);
  if (!pv.ok) throw new ActionError(pv.error ?? 'Invalid action');

  const playedTurn = state.turn;
  const next: StationState = {
    ...state,
    offers: state.offers.map((o) => ({ ...o })),
    repair: state.repair ? { ...state.repair } : null,
    sellerReceivables: { ...state.sellerReceivables },
    visitorRefundable: { ...state.visitorRefundable },
    history: [...state.history],
  };

  let delta = 0n;

  switch (action.kind) {
    case 'standardDocking': {
      const offer = bestEligibleOffer(next, 'standard')!;
      offer.used = true;
      // Escrowed 5 credits: release fee to operating funds, refund the
      // unused remainder to the original payer. The contract does not
      // create money when a ship docks.
      next.fuel -= 1;
      next.served += 1;
      const fee = next.upgrade ? STANDARD_FEE_UPGRADED : STANDARD_FEE;
      const remainder = offer.escrowYocto - fee;
      if (remainder > 0n) {
        next.visitorRefundable[offer.payer] = (next.visitorRefundable[offer.payer] ?? 0n) + remainder;
      }
      next.operatingYocto += fee;
      delta = fee;
      bump(
        next,
        event(
          playedTurn,
          'standardDocking',
          `Standard docking: ship served (offer #${offer.id}, payer ${offer.payer}); ${formatCredits(fee)} Cr released to operating funds${next.upgrade ? ' (upgraded fee)' : ''}`,
          delta,
        ),
      );
      break;
    }
    case 'heavyDocking': {
      const offer = bestEligibleOffer(next, 'heavy')!;
      offer.used = true;
      next.fuel -= 2;
      next.hull -= 1;
      next.served += 1;
      next.operatingYocto += offer.escrowYocto;
      delta = offer.escrowYocto;
      bump(
        next,
        event(
          playedTurn,
          'heavyDocking',
          `Heavy docking: ship served (offer #${offer.id}, payer ${offer.payer}); full ${formatCredits(HEAVY_FEE)} Cr escrow released; hull damaged to ${next.hull}`,
          delta,
        ),
      );
      break;
    }
    case 'refuel': {
      const units = action.units;
      const cost = REFUEL_UNIT_COST * BigInt(units);
      next.operatingYocto -= cost;
      next.fuel += units;
      delta = -cost;
      bump(
        next,
        event(
          playedTurn,
          'refuel',
          `Refuel ${units} unit${units > 1 ? 's' : ''}; paid ${formatCredits(cost)} Cr to fuel supplier bucket`,
          delta,
        ),
      );
      break;
    }
    case 'commissionRepair': {
      next.operatingYocto -= REPAIR_COST;
      delta = -REPAIR_COST;
      const repair: Repair = {
        id: 1,
        supplier: action.supplier,
        reserveYocto: REPAIR_COST,
        campaignId: next.campaignId,
        dueTurn: playedTurn + 1,
        eligibleBlock: currentBlock + SUPPLIER_ELIGIBLE_AFTER_BLOCKS,
        effectApplied: false,
        effectTurn: null,
        paid: false,
      };
      next.repair = repair;
      bump(
        next,
        event(
          playedTurn,
          'commissionRepair',
          `Commission repair: ${formatCredits(REPAIR_COST)} Cr reserved from operating funds; supplier ${repair.supplier}; restores hull after turn ${repair.dueTurn} action; supplier claimable from block ${repair.eligibleBlock}`,
          delta,
        ),
      );
      break;
    }
    case 'upgradeDock': {
      next.operatingYocto -= UPGRADE_COST;
      next.upgrade = true;
      delta = -UPGRADE_COST;
      bump(
        next,
        event(
          playedTurn,
          'upgradeDock',
          `Dock upgraded for ${formatCredits(UPGRADE_COST)} Cr; standard docking now earns ${formatCredits(STANDARD_FEE_UPGRADED)} Cr`,
          delta,
        ),
      );
      break;
    }
    case 'wait': {
      bump(
        next,
        event(playedTurn, 'wait', 'Wait: turn advanced', 0n),
      );
      break;
    }
  }

  // Advance the campaign, then apply any repair whose effect became due.
  next.turn += 1;
  if (
    next.repair &&
    !next.repair.effectApplied &&
    next.repair.dueTurn === playedTurn
  ) {
    const before = next.hull;
    next.hull = Math.min(HULL_CAPACITY, next.hull + 2);
    next.repair.effectApplied = true;
    next.repair.effectTurn = playedTurn;
    bump(
      next,
      event(
        playedTurn,
        'repairEffect',
        `Repair effect applied: hull ${before} to ${next.hull} (bays restored)`,
        0n,
      ),
    );
  }

  return next;
}

/* ------------------------------------------------------------------ */
/* Funding, refunds and claims (non-turn actions)                      */
/* ------------------------------------------------------------------ */

/** A visiting ship funds a new prepaid offer. Does not consume a turn. */
export function fundOffer(
  state: StationState,
  kind: Offer['kind'],
  payer: string,
  currentBlock: bigint,
): StationState {
  const escrow = kind === 'standard' ? STANDARD_FEE_UPGRADED : HEAVY_FEE;
  const id = Math.max(...state.offers.map((o) => o.id), 0) + 1;
  const offer: Offer = {
    id,
    kind,
    payer,
    campaignId: state.campaignId,
    escrowYocto: escrow,
    expiryBlock: currentBlock + 500n,
    used: false,
    refunded: false,
  };
  const next: StationState = { ...state, offers: [...state.offers, offer], history: [...state.history] };
  bump(
    next,
    event(
      state.turn,
      'fundOffer',
      `${kind} offer #${id} funded by ${payer}: ${formatCredits(escrow)} Cr held in visitor escrow`,
      0n,
    ),
  );
  return next;
}

/**
 * Payer reclaim of an expired or unaccepted (campaign-closed) offer.
 * Never touches operating funds. Acceptance and refund cannot both succeed.
 */
export function reclaimOffer(state: StationState, offerId: number, currentBlock: bigint): StationState {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) throw new ActionError(`Unknown offer ${offerId}`);
  if (offer.used) throw new ActionError('Offer already accepted');
  if (offer.refunded) throw new ActionError('Offer already refunded');
  const expired = currentBlock >= offer.expiryBlock;
  const campaignEnded = state.turn > CAMPAIGN_TURNS;
  if (!expired && !campaignEnded) {
    throw new ActionError('Offer not yet reclaimable (not expired and campaign running)');
  }
  const next: StationState = {
    ...state,
    offers: state.offers.map((o) =>
      o.id === offerId ? { ...o, refunded: true } : o,
    ),
    visitorRefundable: { ...state.visitorRefundable },
    history: [...state.history],
  };
  next.visitorRefundable[offer.payer] = (next.visitorRefundable[offer.payer] ?? 0n) + offer.escrowYocto;
  bump(
    next,
    event(
      state.turn,
      'reclaimOffer',
      `Offer #${offerId} reclaimed by ${offer.payer}: ${formatCredits(offer.escrowYocto)} Cr returned`,
      0n,
    ),
  );
  return next;
}

/**
 * Supplier claim of the repair reserve. Recovery from a failed transfer is a
 * contract concern; in the model the reserve moves when payment succeeds.
 */
export function markRepairPaid(state: StationState): StationState {
  if (!state.repair) throw new ActionError('No active repair');
  if (!state.repair.effectApplied) {
    // The hull effect and payment are independent; the fee claim does not
    // require gameplay progress, so eligibility is the only gate.
  }
  const next: StationState = { ...state, repair: { ...state.repair, paid: true }, history: [...state.history] };
  bump(
    next,
    event(
      state.turn,
      'supplierPaid',
      `Supplier ${state.repair.supplier} collected ${formatCredits(state.repair.reserveYocto)} Cr repair fee`,
      0n,
    ),
  );
  return next;
}

/* ------------------------------------------------------------------ */
/* Sale and transfer (non-turn actions)                                */
/* ------------------------------------------------------------------ */

export function listForSale(state: StationState, priceYocto: bigint): StationState {
  const next: StationState = { ...state, listing: { priceYocto }, history: [...state.history] };
  bump(next, event(state.turn, 'list', `Station listed for sale at ${formatCredits(priceYocto)} Cr`, 0n));
  return next;
}

export function unlist(state: StationState): StationState {
  const next: StationState = { ...state, listing: null, history: [...state.history] };
  bump(next, event(state.turn, 'unlist', 'Station listing removed', 0n));
  return next;
}

/**
 * Purchase: buyer submits exact price. Ownership changes, the epoch
 * increments, and a fixed seller receivable is created in the same
 * logical receipt. Every resource, offer, repair and claim persists.
 */
export function purchase(
  state: StationState,
  buyer: string,
  priceYocto: bigint,
  expectedRevision: number,
): StationState {
  if (!state.listing || state.listing.priceYocto !== priceYocto) {
    throw new ActionError('Stale quote: listing or price changed');
  }
  if (state.revision !== expectedRevision) {
    throw new ActionError('Stale quote: state revision changed');
  }
  if (buyer === state.stationAccountId) {
    throw new ActionError('Cannot transfer the station to its own account');
  }
  const seller = state.owner;
  const next: StationState = {
    ...state,
    owner: buyer,
    epoch: state.epoch + 1,
    listing: null,
    sellerReceivables: { ...state.sellerReceivables, [seller]: (state.sellerReceivables[seller] ?? 0n) + priceYocto },
    history: [...state.history],
  };
  bump(
    next,
    event(
      state.turn,
      'sale',
      `Station sold to ${buyer} for ${formatCredits(priceYocto)} Cr payable to seller ${seller}; epoch ${next.epoch}. Resources, repair obligation and creditor claims preserved.`,
      0n,
    ),
  );
  return next;
}

/** Direct NFT transfer without sale terms. Consumes no turn. */
export function transferOwnership(state: StationState, to: string): StationState {
  if (to === state.stationAccountId) {
    throw new ActionError('Cannot transfer the station to its own account');
  }
  const from = state.owner;
  const next: StationState = { ...state, owner: to, epoch: state.epoch + 1, history: [...state.history] };
  bump(
    next,
    event(
      state.turn,
      'transfer',
      `Station transferred from ${from} to ${to}; epoch ${next.epoch}`,
      0n,
    ),
  );
  return next;
}

/* ------------------------------------------------------------------ */
/* Outcome                                                             */
/* ------------------------------------------------------------------ */

export function outcome(state: StationState): CampaignOutcome {
  if (!isCampaignComplete(state)) {
    return {
      complete: false,
      success: false,
      scoreYocto: null,
    };
  }
  const win = state.hull >= 1 && state.served >= 3;
  return {
    complete: true,
    success: win,
    reason: win
      ? 'Campaign complete'
      : state.hull < 1
        ? 'Failed: hull destroyed'
        : 'Failed: fewer than 3 ships served',
    scoreYocto: win ? state.operatingYocto : state.operatingYocto,
  };
}
