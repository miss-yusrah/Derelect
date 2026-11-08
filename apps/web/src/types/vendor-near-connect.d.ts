/**
 * Hand-written minimal declarations for the OPTIONAL `@hot-labs/near-connect`
 * package (the official NEAR wallet connector as of 2025+).
 *
 * Why not the package's own types? DERELICT treats wallet libraries as
 * optional — the app must typecheck even when the dependency fails to
 * install. These declarations shadow real package types through tsconfig
 * `paths` and only cover the popup wallet flow used by src/lib/near.ts
 * (shape verified against @hot-labs/near-connect 0.12.0).
 */
declare module '@hot-labs/near-connect' {
  export interface NearConnectOptions {
    network?: 'mainnet' | 'testnet';
    features?: {
      signMessage?: boolean;
      signTransaction?: boolean;
      signAndSendTransaction?: boolean;
      signAndSendTransactions?: boolean;
      signInWithoutAddKey?: boolean;
    };
    excludedWallets?: string[];
    autoConnect?: boolean;
  }

  export interface ConnectInput {
    walletId?: string;
  }

  export interface NearConnectAction {
    type: 'FunctionCall';
    params: {
      methodName: string;
      args: Record<string, unknown>;
      gas: string;
      deposit: string;
    };
  }

  export interface SignAndSendTransactionParams {
    network?: 'mainnet' | 'testnet';
    signerId?: string;
    receiverId: string;
    actions: NearConnectAction[];
  }

  export interface NearExecutionOutcome {
    transaction?: { hash?: string | null; id?: string | null };
    transactionHash?: string;
    [k: string]: unknown;
  }

  export interface NearConnectAccount {
    accountId: string;
    publicKey?: string;
  }

  export interface NearConnectedWallet {
    wallet: NearWalletBase;
    accounts: NearConnectAccount[];
  }

  export interface NearWalletBase {
    id?: string;
    manifest?: { id?: string; [k: string]: unknown };
    signAndSendTransaction(
      params: SignAndSendTransactionParams,
    ): Promise<NearExecutionOutcome>;
    signOut?(data?: { network?: string }): Promise<void>;
  }

  export class NearConnector {
    constructor(options?: NearConnectOptions);
    connect(input?: ConnectInput): Promise<NearWalletBase>;
    wallet(id?: string | null): Promise<NearWalletBase>;
    getConnectedWallet(): Promise<NearConnectedWallet>;
    disconnect(wallet?: NearWalletBase): Promise<void>;
    on(
      event: 'wallet:signIn' | 'wallet:signOut' | string,
      callback: (payload: { accounts?: NearConnectAccount[]; [k: string]: unknown }) => void,
    ): void;
  }
}
