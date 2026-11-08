import type {
  ActionKind,
  Offer,
} from '@derelict/game-model'

/**
 * Typed thin client for the DERELICT station contract (contracts/station).
 *
 * View methods (get_state / get_offers / get_ledger / get_buckets) never need
 * keys — they go through the read-only RPC provider from src/lib/near.ts.
 * Call methods (act / list_for_sale / unlist / purchase / fund_offer /
 * claim_repair / claim_refund / claim_seller_proceeds / nft_transfer) always
 * go through the connected popup wallet.
 *
 * Money: on-chain amounts are U128 yoctoNEAR strings; 1 displayed credit is
 * exactly 10^21 yoctoNEAR. Every U128 here is a string and conversions are
 * explicit.
 */

export const CREDIT = 1_000_000_000_000_000_000_000n // 0.001 NEAR

/** U128 yoctoNEAR string -> bigint yoctoNEAR (identity semantics). */
export function yocto(value: string | number | bigint): bigint {
  return BigInt(value)
}

/** U128 yoctoNEAR string -> integer credits (floor). */
export function creditsOf(yoctoStr: string | bigint): bigint {
  return (typeof yoctoStr === 'bigint' ? yoctoStr : BigInt(yoctoStr)) / CREDIT
}

/** Integer credits -> U128 yoctoNEAR string for deposit/price payloads. */
export function yoctoOfCredits(credits: number | bigint | string): string {
  const cleaned = typeof credits === 'string' ? credits.replace(/[_,\s]/g, '') : String(credits)
  if (!/^\d+$/.test(cleaned)) throw new Error(`Price must be a whole number of credits, got "${credits}"`)
  return (BigInt(cleaned) * CREDIT).toString()
}

/* ------------------------------------------------------------------ */
/* Raw view shapes (exactly what the contract serializes)              */
/* ------------------------------------------------------------------ */

export interface ChainRepair {
  supplier: string
  eligible_block: number
  due_turn: number
  effect_applied: boolean
  effect_turn: number | null
  paid: boolean
}

export interface ChainState {
  station_account: string
  token_id: string
  owner: string
  campaign_id: number
  revision: number
  epoch: number
  turn: number
  complete: boolean
  fuel: number
  hull: number
  served: number
  upgrade: boolean
  operating: string // U128
  listing: string | null // U128
  locked: boolean
  repair: ChainRepair | null
  outcome: {
    complete: boolean
    success: boolean
    reason: string | null
    score: string | null // U128
  }
  block_height: number
}

export interface ChainOffer {
  id: number
  kind: 'standard' | 'heavy'
  payer: string
  campaign_id: number
  escrow_amount: string // U128
  expiry_block: number
  used: boolean
  refunded: boolean
}

export interface ChainLedgerEvent {
  turn: number
  kind: string
  text: string
  /** Signed operating delta as a decimal string (may be negative). */
  operating_delta: string
  revision: number
  block_height: number
}

export interface ChainBuckets {
  operating: string // U128
  reserved_repair: string
  visitor_escrow_refundable: string
  visitor_refund_balance: string
  seller_receivable: string
  pending_disbursements: string
  storage_reserve: string
  raw_account_balance: string
  unclassified: string
}

/* ------------------------------------------------------------------ */
/* Contract call args (serde shapes of the Rust enums)                 */
/* ------------------------------------------------------------------ */

/**
 * The Rust `GameAction` enum serialized by near-sdk's serde:
 * unit variants serialize as bare strings, payloads as {Variant: {...}}.
 */
export type ContractGameAction =
  | 'StandardDocking'
  | 'HeavyDocking'
  | { Refuel: { units: number } }
  | { CommissionRepair: { supplier: string } }
  | 'UpgradeDock'
  | 'Wait'

export function toContractAction(action: ActionKind): ContractGameAction {
  switch (action.kind) {
    case 'standardDocking':
      return 'StandardDocking'
    case 'heavyDocking':
      return 'HeavyDocking'
    case 'upgradeDock':
      return 'UpgradeDock'
    case 'wait':
      return 'Wait'
    case 'refuel':
      return { Refuel: { units: action.units } }
    case 'commissionRepair':
      return { CommissionRepair: { supplier: action.supplier } }
  }
}

export interface TxOutcome {
  hash: string | null
}

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

export interface StationContractClient {
  stationAccount: string
  viewState(): Promise<ChainState>
  viewOffers(): Promise<ChainOffer[]>
  viewLedger(fromIndex?: number, limit?: number): Promise<ChainLedgerEvent[]>
  viewBuckets(): Promise<ChainBuckets>
  /** Gameplay action; consumes exactly one turn. revision read fresh by caller. */
  act(action: ContractGameAction, expectedRevision: number): Promise<TxOutcome>
  listForSale(priceYocto: string | bigint): Promise<TxOutcome>
  unlist(): Promise<TxOutcome>
  /** Payable: attaches exactly the listed price. revision read fresh by caller. */
  purchase(expectedRevision: number, priceYocto: string | bigint): Promise<TxOutcome>
  /** Visiting ship funds a prepaid offer (deposit exactly 5 or 8 credits). */
  fundOffer(kind: 'standard' | 'heavy'): Promise<TxOutcome>
  claimRepair(): Promise<TxOutcome>
  claimRefund(): Promise<TxOutcome>
  claimSellerProceeds(): Promise<TxOutcome>
  nftTransfer(receiverId: string, memo?: string): Promise<TxOutcome>
}

export async function getStationContract(
  stationAccount: string,
  runtime: import('./near').NearRuntime,
): Promise<StationContractClient> {
  const { GAS_30_TGAS, ONE_YOCTO } = await import('../config')
  const wallet = await runtime.getWallet()

  const client: StationContractClient = {
    stationAccount,
    viewState: () => runtime.view<ChainState>(stationAccount, 'get_state', {}),
    viewOffers: () => runtime.view<ChainOffer[]>(stationAccount, 'get_offers', {}),
    viewLedger: (fromIndex, limit) =>
      runtime.view<ChainLedgerEvent[]>(stationAccount, 'get_ledger', {
        from_index: String(fromIndex ?? 0),
        limit: limit ?? 50,
      }),
    viewBuckets: () => runtime.view<ChainBuckets>(stationAccount, 'get_buckets', {}),
    act: async (action, expectedRevision) => {
      if (!wallet) throw new Error('Connect a wallet to command this station')
      return wrappedTx(wallet.signAndSend({
        receiverId: stationAccount,
        methodName: 'act',
        args: { action, expected_revision: expectedRevision },
        gas: GAS_30_TGAS,
        deposit: '0',
      }))
    },
    listForSale: async (priceYocto) => {
      if (!wallet) throw new Error('Connect a wallet to list this station')
      return wrappedTx(wallet.signAndSend({
        receiverId: stationAccount,
        methodName: 'list_for_sale',
        args: { price: BigInt(priceYocto).toString() },
        gas: GAS_30_TGAS,
        deposit: '0',
      }))
    },
    unlist: async () => {
      if (!wallet) throw new Error('Connect a wallet to change this listing')
      return wrappedTx(wallet.signAndSend({
        receiverId: stationAccount,
        methodName: 'unlist',
        args: {},
        gas: GAS_30_TGAS,
        deposit: '0',
      }))
    },
    purchase: async (expectedRevision, priceYocto) => {
      if (!wallet) throw new Error('Connect a wallet to buy this station')
      return wrappedTx(wallet.signAndSend({
        receiverId: stationAccount,
        methodName: 'purchase',
        args: { expected_revision: expectedRevision },
        gas: GAS_30_TGAS,
        deposit: BigInt(priceYocto).toString(),
      }))
    },
    fundOffer: async (kind) => {
      if (!wallet) throw new Error('Connect a wallet to fund an offer')
      const escrow = kind === 'standard' ? yoctoOfCredits(5) : yoctoOfCredits(8)
      return wrappedTx(wallet.signAndSend({
        receiverId: stationAccount,
        methodName: 'fund_offer',
        args: { kind: kind === 'standard' ? 'Standard' : 'Heavy' },
        gas: GAS_30_TGAS,
        deposit: escrow,
      }))
    },
    claimRepair: async () => {
      if (!wallet) throw new Error('Only the recorded supplier may claim')
      return wrappedTx(wallet.signAndSend({
        receiverId: stationAccount,
        methodName: 'claim_repair',
        args: {},
        gas: GAS_30_TGAS,
        deposit: '0',
      }))
    },
    claimRefund: async () => {
      if (!wallet) throw new Error('Connect a wallet to claim a refund')
      return wrappedTx(wallet.signAndSend({
        receiverId: stationAccount,
        methodName: 'claim_refund',
        args: {},
        gas: GAS_30_TGAS,
        deposit: '0',
      }))
    },
    claimSellerProceeds: async () => {
      if (!wallet) throw new Error('Connect a wallet to claim proceeds')
      return wrappedTx(wallet.signAndSend({
        receiverId: stationAccount,
        methodName: 'claim_seller_proceeds',
        args: {},
        gas: GAS_30_TGAS,
        deposit: '0',
      }))
    },
    nftTransfer: async (receiverId, memo) => {
      if (!wallet) throw new Error('Connect a wallet to transfer the station NFT')
      return wrappedTx(wallet.signAndSend({
        receiverId: stationAccount,
        methodName: 'nft_transfer',
        args: { receiver_id: receiverId, token_id: 'station', approval_id: null, memo: memo ?? null },
        gas: GAS_30_TGAS,
        deposit: ONE_YOCTO,
      }))
    },
  }
  return client
}

async function wrappedTx(pending: Promise<import('./near').NearExecutionOutcome>): Promise<TxOutcome> {
  try {
    const outcome = await pending
    const hash =
      (outcome as { transaction?: { hash?: string | null } }).transaction?.hash ??
      (outcome as { transactionHash?: string }).transactionHash ??
      null
    return { hash }
  } catch (error) {
    throw new Error(extractContractError(error))
  }
}

/**
 * Surface the exact contract error text. NEAR RPC embeds the panic message
 * as "Smart contract panicked: <text>"; show the game's own words only.
 */
export function extractContractError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const match = raw.match(/panicked[^:]*:\s*(.+?)(?:\.\s*$|\n|$)/s)
  if (match) return match[1].trim().replace(/^["{]|["}],?$/g, '')
  // Wallet-provider JSON dumps sometimes carry the message as a kv body.
  const quoted = raw.match(/"panicked"?[^a-zA-Z]*([A-Z][^"\n]{6,})/)
  if (quoted) return quoted[1].trim()
  return raw.trim() || 'Transaction failed'
}
