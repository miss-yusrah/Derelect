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
 * talks to the small surface below. Both `near-api-js` (RPC views) and
 * `@hot-labs/near-connect` (popup wallet flow) are OPTIONAL dependencies:
 * when they cannot be loaded the app falls back to practice-only mode with a
 * banner — the build never depends on them existing.
 *
 * - Views: near-api-js v6 `JsonRpcProvider` callFunction with endpoint
 *   failover and a pure-`fetch` fallback so read-only state still loads.
 * - Wallet: NEAR Connector popup flow on testnet (wallet selection popup;
 *   sessions are restored automatically on revisit).
 */

export type { NearConnectAction, NearExecutionOutcome }

export interface SignAndSendInput {
  receiverId: string
  methodName: string
  args: Record<string, unknown>
  /** Gas in gas units, string form (e.g. "30000000000000" = 30 TGas). */
  gas: string
  /** Attached deposit in yoctoNEAR, string form. */
  deposit: string
}

export interface DerelictWallet {
  accountId: string
  signAndSend(input: SignAndSendInput): Promise<NearExecutionOutcome>
  disconnect(): Promise<void>
}

export interface NearRuntime {
  /** View (read-only, no keys) call on any contract account. */
  view<T>(contractId: string, methodName: string, args: Record<string, unknown>): Promise<T>
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

const declaredNearApi: boolean =
  typeof __DERELICT_NEAR_API__ === 'boolean' ? __DERELICT_NEAR_API__ : true

/** Load and memoize the runtime. Resolves null only when RPC also fails. */
export async function loadNearRuntime(): Promise<NearRuntime | null> {
  if (cached === undefined) {
    cached = await buildRuntime().catch(() => null)
  }
  return cached
}

async function buildRuntime(): Promise<NearRuntime> {
  let view = makeFetchView()
  if (declaredNearApi) {
    try {
      view = makeNearApiProviderView(await import('near-api-js'))
    } catch {
      view = makeFetchView()
    }
  }

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
          actions: [
            {
              type: 'FunctionCall',
              params: {
                methodName: input.methodName,
                args: input.args,
                gas: input.gas,
                deposit: input.deposit,
              },
            },
          ],
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
    locatorAfterSignIn(connector)
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
    walletLibraryAvailable: connector !== null,
    getWallet,
    connectWallet,
    disconnectWallet,
  }
}

/** Keep a floating reference used by the automatic session restore. */
function locatorAfterSignIn(_connector: NearConnector): void {
  // The connector persists the session in its own storage; nothing to do here.
}

function makeNearApiProviderView(naj: typeof import('near-api-js')): NearRuntime['view'] {
  const provider = new naj.FailoverRpcProvider(
    RPC_ENDPOINTS.map((url) => new naj.JsonRpcProvider({ url })),
  )
  return async <T,>(contractId: string, methodName: string, args: Record<string, unknown>) => {
    const result = await provider.callFunction<T>(contractId, methodName, args)
    if (result === undefined) {
      throw new Error(`RPC returned nothing for ${methodName} on ${contractId}`)
    }
    return result
  }
}

/** Minimal JSON-RPC view implementation with endpoint failover (no deps). */
function makeFetchView(): NearRuntime['view'] {
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
        const json = (await response.json()) as {
          result?: T & { error?: { message?: string; cause?: { message?: string } } }
          error?: { message?: string; cause?: { message?: string } }
        }
        const payload = json.result ?? json
        if ((payload as { error?: { message?: string } }).error) {
          const fail = (payload as {
            error: { message?: string; cause?: { message?: string } }
          }).error
          throw new Error((fail.cause?.message ?? fail.message) || 'RPC error')
        }
        index = (index + attempt) % RPC_ENDPOINTS.length
        return payload as T
      } catch (error) {
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }
  return async <T,>(contractId: string, methodName: string, args: Record<string, unknown>) => {
    const raw = await rpcCall<{
      result?: { result: number[]; error?: { message?: string } }
      error?: { message?: string; cause?: { message?: string } }
    }>({
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: contractId,
        method_name: methodName,
        args_base64: btoa(JSON.stringify(args)),
      },
    })
    if (raw.error) throw new Error(raw.error.message ?? 'RPC query error')
    const bytes = raw.result?.result
    if (!bytes) throw new Error(`RPC returned nothing for ${methodName} on ${contractId}`)
    const text = new Uint8Array(bytes).reduce(
      (acc, byte) => acc + String.fromCharCode(byte),
      '',
    )
    return JSON.parse(text) as T
  }
}
