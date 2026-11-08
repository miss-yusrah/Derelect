import rpcConfig from '../config.json'

/**
 * DERELICT web runtime configuration.
 *
 * The station account resolution order ("sleeve"):
 *   1. Vite env `VITE_STATION_ACCOUNT` (set via .env / shell),
 *   2. `config.json` field `stationAccount` (when non-null),
 *   3. the built-in testnet fallback constant.
 */

export const DEFAULT_STATION_ACCOUNT = 'isa01.derelict-factory.testnet'

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}

export const STATION_ACCOUNT: string =
  env.VITE_STATION_ACCOUNT || rpcConfig.stationAccount || DEFAULT_STATION_ACCOUNT

export const NETWORK: 'testnet' | 'mainnet' = rpcConfig.network === 'mainnet' ? 'mainnet' : 'testnet'

export const RPC_ENDPOINTS: string[] =
  rpcConfig.rpcEndpoints.length > 0
    ? rpcConfig.rpcEndpoints
    : ['https://rpc.testnet.fastnear.com']

/** Practice-only station identity (never touches NEAR). */
export const PRACTICE_STATION_ACCOUNT = 'station.practice.derelict'
export const PRACTICE_OWNER = 'you.derelict.practice'
export const PRACTICE_BUYER = 'buyer.derelict.practice'

export const GAS_30_TGAS = '30000000000000'
export const ONE_YOCTO = '1'
