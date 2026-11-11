import { FACTORY_ACCOUNT, GAS_300_TGAS, STATION_FUNDING_YOCTO, STATION_SCENARIO } from '../config'
import { CREDIT, sendTx, type TxOutcome } from './contract'
import type { DerelictWallet, NearRuntime } from './near'

/**
 * Client for contracts/factory: every player launches their own station as
 * `<name>.<factory>`, owned by the player's wallet from the first block.
 */

export interface StationInfo {
  station_account: string
  captain: string
  scenario: string
  created_block: number
}

/** The standard scenario's visitor traffic: offers #1–6 standard, #7–12 heavy. */
export const TRAFFIC_KINDS: Array<'standard' | 'heavy'> = [
  ...Array<'standard'>(6).fill('standard'),
  ...Array<'heavy'>(6).fill('heavy'),
]
export const TRAFFIC_ESCROW_YOCTO = TRAFFIC_KINDS.reduce(
  (sum, kind) => sum + (kind === 'standard' ? 5n : 8n) * CREDIT,
  0n,
)

/** Longest name that keeps `<name>.<factory>` within NEAR's 64-char limit. */
export const MAX_STATION_NAME = 64 - FACTORY_ACCOUNT.length - 1

const NAME_PATTERN = /^[a-z0-9]+([-_][a-z0-9]+)*$/

export function stationAccountFor(name: string): string {
  return `${name}.${FACTORY_ACCOUNT}`
}

/** Reason the name cannot be used, or null when it is well-formed. */
export function stationNameProblem(name: string): string | null {
  if (name.length === 0) return 'Enter a station name'
  if (name.length > MAX_STATION_NAME) return `At most ${MAX_STATION_NAME} characters`
  if (!NAME_PATTERN.test(name)) {
    return 'Lowercase letters and digits, joined by single - or _'
  }
  return null
}

/** A fresh, readable default derived from the captain's account. */
export function suggestStationName(captain: string): string {
  const base = (captain.split('.')[0] ?? '').replace(/[^a-z0-9]/g, '').slice(0, 14) || 'station'
  return `${base}-${Date.now().toString(36).slice(-5)}`
}

export function listStations(runtime: NearRuntime): Promise<StationInfo[]> {
  return runtime.view<StationInfo[]>(FACTORY_ACCOUNT, 'get_stations', {})
}

/**
 * Stations the account owns right now, newest first. The factory index only
 * records the launching captain, so ownership is read from each station
 * (a purchase moves it). Unreadable stations are skipped.
 */
export async function stationsOwnedBy(runtime: NearRuntime, account: string): Promise<StationInfo[]> {
  const all = await listStations(runtime)
  const owners = await Promise.all(
    all.map((info) => runtime.view<string>(info.station_account, 'get_owner', {}).catch(() => null)),
  )
  return all
    .filter((_, i) => owners[i] === account)
    .sort((a, b) => b.created_block - a.created_block)
}

/** Ask the factory to create, fund and initialize a station owned by the wallet. */
export function createStation(wallet: DerelictWallet, name: string): Promise<TxOutcome> {
  return sendTx(wallet, FACTORY_ACCOUNT, [
    {
      methodName: 'create_station',
      args: { name, captain: wallet.accountId, scenario: STATION_SCENARIO },
      gas: GAS_300_TGAS,
      deposit: STATION_FUNDING_YOCTO.toString(),
    },
  ])
}
