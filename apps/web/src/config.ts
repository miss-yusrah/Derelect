import rpcConfig from '../config.json'

/**
 * DERELICT web runtime configuration. There is no default station: the app
 * opens the stations the connected wallet owns, or a `?station=` link.
 */

export const NETWORK: 'testnet' | 'mainnet' = rpcConfig.network === 'mainnet' ? 'mainnet' : 'testnet'

export const RPC_ENDPOINTS: string[] =
  rpcConfig.rpcEndpoints.length > 0
    ? rpcConfig.rpcEndpoints
    : ['https://rpc.testnet.fastnear.com']

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
