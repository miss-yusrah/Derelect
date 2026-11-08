/**
 * Hand-written minimal declarations for the OPTIONAL `near-api-js` package.
 *
 * Why not the package's own types? DERELICT treats near-api-js as optional —
 * the app must typecheck even when the dependency fails to install. These
 * declarations shadow real package types through tsconfig `paths` and only
 * cover the surface src/lib/near.ts uses (function-shape verified against
 * near-api-js v6.5.1 / @near-js/providers 2.5.1).
 */
declare module 'near-api-js' {
  export interface NearRpcProviderConfig {
    url: string;
    allowInsecureRequest?: boolean;
    secondsPerHeartbeatAttempt?: number;
    maxRetries?: number;
    backoff?: unknown;
    headers?: Record<string, string | number>;
  }

  export interface NearBlockReference {
    blockId?: string | number;
    finality?: 'optimistic' | 'near-final' | 'final';
  }

  export class JsonRpcProvider {
    constructor(config: NearRpcProviderConfig);
    callFunction<T = unknown>(
      contractId: string,
      method: string,
      args: Record<string, unknown> | Uint8Array,
      blockQuery?: NearBlockReference,
    ): Promise<T | undefined>;
    callFunctionRaw<T = unknown>(
      contractId: string,
      method: string,
      args: Record<string, unknown> | Uint8Array,
      blockQuery?: NearBlockReference,
    ): Promise<{ result: unknown[]; [k: string]: unknown }>;
    viewAccount(accountId: string, blockQuery?: NearBlockReference): Promise<{ amount: string }>;
  }

  export class FailoverRpcProvider {
    constructor(providers: JsonRpcProvider[]);
    callFunction<T = unknown>(
      contractId: string,
      method: string,
      args: Record<string, unknown> | Uint8Array,
      blockQuery?: NearBlockReference,
    ): Promise<T | undefined>;
    viewAccount(accountId: string, blockQuery?: NearBlockReference): Promise<{ amount: string }>;
  }
}
