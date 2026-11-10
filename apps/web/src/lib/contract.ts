import type { ActionKind } from '@derelict/game-model'
import { GAS_30_TGAS, GAS_100_TGAS, GAS_FUND_OFFER, ONE_YOCTO } from '../config'
import type { DerelictWallet, FunctionCallInput, NearExecutionOutcome, NearRuntime } from './near'

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
  | { kind: 'standardDocking' }
  | { kind: 'heavyDocking' }
  | { kind: 'refuel'; units: number }
  | { kind: 'commissionRepair'; supplier: string }
  | { kind: 'upgradeDock' }
  | { kind: 'wait' }

export function toContractAction(action: ActionKind): ContractGameAction {
  switch (action.kind) {
    case 'standardDocking':
      return { kind: 'standardDocking' }
    case 'heavyDocking':
      return { kind: 'heavyDocking' }
    case 'upgradeDock':
      return { kind: 'upgradeDock' }
    case 'wait':
      return { kind: 'wait' }
    case 'refuel':
      return { kind: 'refuel', units: action.units }
    case 'commissionRepair':
      return { kind: 'commissionRepair', supplier: action.supplier }
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
  /** Fund prepaid visitor offers (exactly 5 or 8 credits each) in one transaction. */
  fundOffers(kinds: Array<'standard' | 'heavy'>): Promise<TxOutcome>
  claimRepair(): Promise<TxOutcome>
  claimRefund(): Promise<TxOutcome>
  claimSellerProceeds(): Promise<TxOutcome>
  nftTransfer(receiverId: string, memo?: string): Promise<TxOutcome>
}

function functionCall(
  methodName: string,
  args: Record<string, unknown>,
  { gas = GAS_30_TGAS, deposit = '0' }: { gas?: string; deposit?: string } = {},
): FunctionCallInput {
  return { methodName, args, gas, deposit }
}

export async function getStationContract(
  stationAccount: string,
  runtime: NearRuntime,
): Promise<StationContractClient> {
  const wallet = await runtime.getWallet()
  const send = (connectPrompt: string, ...calls: FunctionCallInput[]): Promise<TxOutcome> =>
    wallet ? sendTx(wallet, stationAccount, calls) : Promise.reject(new Error(connectPrompt))

  return {
    stationAccount,
    viewState: () => runtime.view<ChainState>(stationAccount, 'get_state', {}),
    viewOffers: () => runtime.view<ChainOffer[]>(stationAccount, 'get_offers', {}),
    viewLedger: (fromIndex, limit) =>
      runtime.view<ChainLedgerEvent[]>(stationAccount, 'get_ledger', {
        from_index: String(fromIndex ?? 0),
        limit: limit ?? 50,
      }),
    viewBuckets: () => runtime.view<ChainBuckets>(stationAccount, 'get_buckets', {}),
    act: (action, expectedRevision) =>
      send(
        'Connect a wallet to command this station',
        functionCall('act', { action, expected_revision: expectedRevision }),
      ),
    listForSale: (priceYocto) =>
      send(
        'Connect a wallet to list this station',
        functionCall('list_for_sale', { price: BigInt(priceYocto).toString() }),
      ),
    unlist: () => send('Connect a wallet to change this listing', functionCall('unlist', {})),
    purchase: (expectedRevision, priceYocto) =>
      send(
        'Connect a wallet to buy this station',
        functionCall(
          'purchase',
          { expected_revision: expectedRevision },
          { deposit: BigInt(priceYocto).toString() },
        ),
      ),
    fundOffers: (kinds) =>
      send(
        'Connect a wallet to fund visitor offers',
        ...kinds.map((kind) =>
          functionCall(
            'fund_offer',
            { kind },
            { gas: GAS_FUND_OFFER, deposit: yoctoOfCredits(kind === 'standard' ? 5 : 8) },
          ),
        ),
      ),
    claimRepair: () =>
      send('Only the recorded supplier may claim', functionCall('claim_repair', {}, { gas: GAS_100_TGAS })),
    claimRefund: () =>
      send('Connect a wallet to claim a refund', functionCall('claim_refund', {}, { gas: GAS_100_TGAS })),
    claimSellerProceeds: () =>
      send(
        'Connect a wallet to claim proceeds',
        functionCall('claim_seller_proceeds', {}, { gas: GAS_100_TGAS }),
      ),
    nftTransfer: (receiverId, memo) =>
      send(
        'Connect a wallet to transfer the station NFT',
        functionCall(
          'nft_transfer',
          { receiver_id: receiverId, token_id: 'station', approval_id: null, memo: memo ?? null },
          { gas: GAS_100_TGAS, deposit: ONE_YOCTO },
        ),
      ),
  }
}

/** Sign one transaction with the connected wallet and surface on-chain failures. */
export function sendTx(wallet: DerelictWallet, receiverId: string, calls: FunctionCallInput[]): Promise<TxOutcome> {
  return wrappedTx(wallet.signAndSend({ receiverId, calls }))
}

async function wrappedTx(pending: Promise<NearExecutionOutcome>): Promise<TxOutcome> {
  let outcome: NearExecutionOutcome
  try {
    outcome = await pending
  } catch (error) {
    throw new Error(extractContractError(error))
  }
  // Some wallets resolve with a failed outcome instead of rejecting.
  const failure = (outcome as { status?: { Failure?: unknown } } | undefined)?.status?.Failure
  if (failure !== undefined) {
    throw new Error(extractContractError(JSON.stringify(failure)))
  }
  const hash =
    (outcome as { transaction?: { hash?: string | null } } | undefined)?.transaction?.hash ??
    (outcome as { transactionHash?: string } | undefined)?.transactionHash ??
    null
  return { hash }
}

/**
 * Surface the exact contract error text. NEAR RPC embeds the panic message
 * as "Smart contract panicked: <text>"; show the game's own words only.
 */
export function extractContractError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const match = raw.match(/panicked[^:]*:\s*([^"\n\\]+)/)
  if (match) return match[1].trim().replace(/\.$/, '')
  // Wallet-provider JSON dumps sometimes carry the message as a kv body.
  const quoted = raw.match(/"panicked"?[^a-zA-Z]*([A-Z][^"\n]{6,})/)
  if (quoted) return quoted[1].trim()
  return raw.trim() || 'Transaction failed'
}
