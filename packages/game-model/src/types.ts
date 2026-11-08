/**
 * Core DERELICT types.
 *
 * Money: one displayed CREDIT is exactly 0.001 testnet NEAR = 10^21 yoctoNEAR.
 * Credits are a display unit only — never a token. Amounts are stored as
 * integer yoctoNEAR; quantities (fuel, hull) are integers.
 */

/** 1 credit = 0.001 NEAR = 10^21 yoctoNEAR */
export const CREDIT = 1_000_000_000_000_000_000_000n;

/** Fuel capacity of every station. */
export const FUEL_CAPACITY = 6;
/** Hull capacity of every station. */
export const HULL_CAPACITY = 3;
/** Campaign length in gameplay turns. */
export const CAMPAIGN_TURNS = 6;

/** Standard docking fee without the dock upgrade. */
export const STANDARD_FEE = 3n * CREDIT;
/** Standard docking fee after the dock upgrade. */
export const STANDARD_FEE_UPGRADED = 5n * CREDIT;
/** Heavy docking fee. */
export const HEAVY_FEE = 8n * CREDIT;
/** Refuel cost per unit. */
export const REFUEL_UNIT_COST = 2n * CREDIT;
/** Repair commission cost (moved to the protected repair reserve). */
export const REPAIR_COST = 4n * CREDIT;
/** Dock upgrade cost. */
export const UPGRADE_COST = 4n * CREDIT;
/**
 * Payment-eligibility delay for a supplier claim, in NEAR block height.
 * The supplier can claim once the current height reaches this threshold.
 */
export const SUPPLIER_ELIGIBLE_AFTER_BLOCKS = 5n;

export type OfferKind = 'standard' | 'heavy';

export type ActionKind =
  | { kind: 'standardDocking' }
  | { kind: 'heavyDocking' }
  | { kind: 'refuel'; units: number }
  | { kind: 'commissionRepair'; supplier: string }
  | { kind: 'upgradeDock' }
  | { kind: 'wait' };

/** Repair obligation recorded on the station; survives ownership transfer. */
export interface Repair {
  id: number;
  /** Supplier account that will collect the reserve. */
  supplier: string;
  /** 4 credits of operating funds moved into a protected reserve. */
  reserveYocto: bigint;
  campaignId: number;
  /** Turn number whose action triggers the hull effect (purchase turn + 1). */
  dueTurn: number;
  /** NEAR block height at which the supplier becomes eligible to claim. */
  eligibleBlock: bigint;
  /** Hull effect already applied by the game rules. */
  effectApplied: boolean;
  /** Hull effect was applied at this turn number. */
  effectTurn: number | null;
  /** Supplier has been (or is being) paid this reserve. */
  paid: boolean;
}

/** Prepaid docking offer escrowed by a visiting ship before the captain acts. */
export interface Offer {
  id: number;
  kind: OfferKind;
  /** Visiting-ship account that deposited this offer. */
  payer: string;
  campaignId: number;
  /** Amount held in visitor escrow: 5 credits standard, 8 credits heavy. */
  escrowYocto: bigint;
  /** Offer expires at this NEAR block height; payer may reclaim after it. */
  expiryBlock: bigint;
  used: boolean;
  refunded: boolean;
}

export interface StarterConfig {
  /** Opening operating funds. Standard salvage: 10 credits. */
  operatingYocto: bigint;
  fuel: number;
  hull: number;
  /** Seeded visitor offers. */
  standardOffers: number;
  heavyOffers: number;
  /** Demo visiting-ship payer account. */
  visitorPayer: string;
}

/** Complete authoritative state of one station. */
export interface StationState {
  /** Station NEAR account id — also the base of its NFT id pair. */
  stationAccountId: string;
  /** Local token id (one NFT per station contract). */
  tokenId: string;
  /** Single ownership authority: the NFT owner is the captain. */
  owner: string;
  campaignId: number;
  /** Incremented on every economically relevant mutation. */
  revision: number;
  /** Incremented on every ownership change, including a transfer rollback. */
  epoch: number;
  /** 1-based next turn that a gameplay action would consume. */
  turn: number;
  operatingYocto: bigint;
  fuel: number;
  hull: number;
  served: number;
  upgrade: boolean;
  repair: Repair | null;
  offers: Offer[];
  /** Sale listing; price paid to the seller, never to station operations. */
  listing: { priceYocto: bigint } | null;
  /** Fixed receivable created by a purchase: seller account -> amount. */
  sellerReceivables: Record<string, bigint>;
  /** Visitor refundable balance: payer -> unused escrow. */
  visitorRefundable: Record<string, bigint>;
  history: HistoryEvent[];
}

/** Append-only ledger event; mirrors on-chain receipts. */
export interface HistoryEvent {
  turn: number;
  kind: string;
  text: string;
  /** Operating-funds delta in yocto (signed). */
  operatingDeltaYocto: bigint;
}

export interface ActionPreview {
  ok: boolean;
  error?: string;
  /** Cost charged to operating funds, in yocto (0 for wait). */
  operatingCostYocto: bigint;
  /** Operating funds released by this action (docking fees), in yocto. */
  operatingGainYocto: bigint;
  fuelDelta: number;
  hullDelta: number;
  turnsPlayed: number;
  text: string;
}

export interface CampaignOutcome {
  complete: boolean;
  success: boolean;
  reason?: string;
  /** Final operating treasury — the score. */
  scoreYocto: bigint | null;
}
