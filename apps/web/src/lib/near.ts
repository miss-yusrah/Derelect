import { RPC_ENDPOINTS } from '../config'
import type {
  NearConnectAction,
  NearConnector,
  NearExecutionOutcome,
} from '@hot-labs/near-connect'

/**
 * Isolated NEAR runtime for the DERELICT bridge.
 *
 * Everything wallet- and RPC-related lives here so the rest of the app only
 * talks to the small surface below. `@hot-labs/near-connect` (popup wallet
 * flow) is an OPTIONAL dependency: reads keep working without it, and the UI
 * explains that signing is unavailable rather than falling back to a
 * simulated game.
 *
 * - Views: failover `fetch` JSON-RPC so read-only state loads without keys.
 * - Wallet: NEAR Connector popup flow on testnet (wallet selection popup;
 *   sessions are restored automatically on revisit).
 */

export type { NearConnectAction, NearExecutionOutcome }

export interface FunctionCallInput {
  methodName: string
  args: Record<string, unknown>
  /** Gas in gas units, string form (e.g. "30000000000000" = 30 TGas). */
  gas: string
  /** Attached deposit in yoctoNEAR, string form. */
  deposit: string
}

/** One transaction: every call runs in order against the same receiver. */
export interface SignAndSendInput {
  receiverId: string
  calls: FunctionCallInput[]
}

export interface DerelictWallet {
  accountId: string
  signAndSend(input: SignAndSendInput): Promise<NearExecutionOutcome>
  disconnect(): Promise<void>
}

export interface NearRuntime {
  /** View (read-only, no keys) call on any contract account. */
  view<T>(contractId: string, methodName: string, args: Record<string, unknown>): Promise<T>
  /** Liquid balance in yoctoNEAR, or null when the account does not exist. */
  accountBalance(accountId: string): Promise<bigint | null>
  /** True when the wallet connector library itself is available. */
  walletLibraryAvailable: boolean
  /** Restore an existing popup-wallet session (no popup). Memoized. */
  getWallet(): Promise<DerelictWallet | null>
  /** Open the popup wallet selection on testnet and connect. */
  connectWallet(): Promise<DerelictWallet | null>
  /** Drop the stored popup-wallet session. */
  disconnectWallet(): Promise<void>
}

let cached: NearRuntime | null | undefined

/** Load and memoize the runtime. Resolves null only when RPC also fails. */
export async function loadNearRuntime(): Promise<NearRuntime | null> {
  if (cached === undefined) {
    cached = await buildRuntime().catch(() => null)
  }
  return cached
}

async function buildRuntime(): Promise<NearRuntime> {
  // Views use a dependency-free failover fetch, CORS-verified in-browser.
  const { view, accountBalance } = makeFetchRpc()

  let connector: NearConnector | null = null
  try {
    const nc = await import('@hot-labs/near-connect')
    connector = new nc.NearConnector({
      network: 'testnet',
      features: {
        signAndSendTransaction: true,
        signAndSendTransactions: true,
        signInWithoutAddKey: true,
      },
    })
  } catch {
    connector = null
  }

  const connected = new Map<string, DerelictWallet>()
  let accountId: string | null = null

  async function sessionFromConnectedWallet(): Promise<DerelictWallet | null> {
    if (!connector) return null
    const session: { wallet: Awaited<ReturnType<NearConnector['connect']>>; accounts: Array<{ accountId: string }> } =
      await connector.getConnectedWallet()
    const who = session.accounts[0]?.accountId
    if (!session.wallet || !who) return null
    const known = connected.get(who)
    if (known) return known
    const wallet = session.wallet
    const created: DerelictWallet = {
      accountId: who,
      signAndSend: (input) =>
        wallet.signAndSendTransaction({
          signerId: who,
          receiverId: input.receiverId,
          actions: input.calls.map((params) => ({ type: 'FunctionCall', params })),
        }),
      disconnect: async () => {
        await connector.disconnect(wallet)
        connected.delete(who)
        if (accountId === who) accountId = null
      },
    }
    connected.set(who, created)
    return created
  }

  async function getWallet(): Promise<DerelictWallet | null> {
    if (accountId && connected.has(accountId)) {
      const got = connected.get(accountId)
      if (got) return got
    }
    try {
      const restored = await sessionFromConnectedWallet()
      if (restored) accountId = restored.accountId
      return restored
    } catch {
      return null
    }
  }

  async function connectWallet(): Promise<DerelictWallet | null> {
    if (!connector) return null
    // Popup wallet flow: opens the NEAR Connector selection popup; the same
    // popup deep-links to the account's web wallet when one is picked.
    await connector.connect()
    const session = await sessionFromConnectedWallet()
    accountId = session?.accountId ?? null
    return session
  }

  async function disconnectWallet(): Promise<void> {
    const wallet = accountId ? connected.get(accountId) : (await getWallet())
    if (wallet) {
      await wallet.disconnect()
      return
    }
    if (connector) await connector.disconnect(undefined)
  }

  return {
    view,
    accountBalance,
    walletLibraryAvailable: connector !== null,
    getWallet,
    connectWallet,
    disconnectWallet,
  }
}

interface RpcError {
  message?: string
  data?: unknown
  cause?: { name?: string; message?: string }
}

/** JSON-RPC failure; `causeName` is the node's error kind, e.g. UNKNOWN_ACCOUNT. */
class RpcFailure extends Error {
  constructor(
    message: string,
    readonly causeName: string | undefined,
  ) {
    super(message)
    this.name = 'RpcFailure'
  }
}

/** Minimal JSON-RPC client with endpoint failover (no deps). */
function makeFetchRpc(): Pick<NearRuntime, 'view' | 'accountBalance'> {
  let index = 0

  async function rpcCall<T>(body: Record<string, unknown>): Promise<T> {
    let lastError: unknown = new Error('no RPC endpoints configured')
    for (let attempt = 0; attempt < RPC_ENDPOINTS.length; attempt++) {
      const url = RPC_ENDPOINTS[(index + attempt) % RPC_ENDPOINTS.length]
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, jsonrpc: '2.0', id: Date.now() }),
        })
        const json = (await response.json()) as { result?: T & { error?: RpcError }; error?: RpcError }
        const payload = json.result ?? json
        const fail = (payload as { error?: RpcError }).error
        if (fail) {
          const text =
            fail.cause?.message ??
            (typeof fail.data === 'string' ? fail.data : undefined) ??
            fail.message ??
            `RPC error (${JSON.stringify(fail).slice(0, 120)})`
          throw new RpcFailure(text, fail.cause?.name)
        }
        index = (index + attempt) % RPC_ENDPOINTS.length
        return payload as T
      } catch (error) {
        lastError = error
        console.warn('[derelict:rpc] endpoint failed', url, error)
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  async function accountBalance(accountId: string): Promise<bigint | null> {
    try {
      const account = await rpcCall<{ amount: string }>({
        method: 'query',
        params: { request_type: 'view_account', finality: 'final', account_id: accountId },
      })
      return BigInt(account.amount)
    } catch (error) {
      if (error instanceof RpcFailure && error.causeName === 'UNKNOWN_ACCOUNT') return null
      throw error
    }
  }

  async function view<T>(contractId: string, methodName: string, args: Record<string, unknown>): Promise<T> {
    // The query result carries the view's return value as UTF-8 bytes.
    const callResult = await rpcCall<{ result?: number[] }>({
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: contractId,
        method_name: methodName,
        args_base64: btoa(JSON.stringify(args)),
      },
    })
    const bytes = callResult.result
    if (!bytes || bytes.length === 0) {
      throw new Error(`RPC returned nothing for ${methodName} on ${contractId}`)
    }
    return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as T
  }

  return { view, accountBalance }
}
