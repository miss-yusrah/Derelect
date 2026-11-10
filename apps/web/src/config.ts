import rpcConfig from '../config.json'

/**
 * DERELICT web runtime configuration.
 *
 * The station account resolution order ("sleeve"):
 *   1. Vite env `VITE_STATION_ACCOUNT` (set via .env / shell),
 *   2. `config.json` field `stationAccount` (when non-null),
 *   3. the built-in testnet fallback constant.
 */

export const DEFAULT_STATION_ACCOUNT = 'isa02.derelict-factory.testnet'

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}

export const STATION_ACCOUNT: string =
  env.VITE_STATION_ACCOUNT || rpcConfig.stationAccount || DEFAULT_STATION_ACCOUNT

export const NETWORK: 'testnet' | 'mainnet' = rpcConfig.network === 'mainnet' ? 'mainnet' : 'testnet'

export const RPC_ENDPOINTS: string[] =
  rpcConfig.rpcEndpoints.length > 0
    ? rpcConfig.rpcEndpoints
    : ['https://rpc.testnet.fastnear.com']

/** Seeded scenario accounts (the default repair supplier is pre-filled in the UI). */
export const SUPPLIER_ACCOUNT: string = rpcConfig.demoAccounts.supplier

/** Factory that creates player stations as `<name>.<factory>`. */
export const FACTORY_ACCOUNT: string = rpcConfig.factoryAccount
export const STATION_SCENARIO = 'standard-salvage'
/** Must match the factory's STATION_FUNDING: 6 NEAR storage reserve + 10 Cr opening funds. */
export const STATION_FUNDING_YOCTO = 6_010_000_000_000_000_000_000_000n

export const GAS_30_TGAS = '30000000000000'
/** Calls that schedule a payout or NFT-resolve promise need room for the callback. */
export const GAS_100_TGAS = '100000000000000'
/** Per fund_offer call; twelve of them must fit in one 300 TGas transaction. */
export const GAS_FUND_OFFER = '20000000000000'
/** create_station deploys the station wasm and runs its init in one batch. */
export const GAS_300_TGAS = '300000000000000'
export const ONE_YOCTO = '1'
