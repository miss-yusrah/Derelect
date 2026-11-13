import { CREDIT } from '@derelict/game-model'

/**
 * Display formats for the interface. Credits are whole numbers on chain, so
 * the screen shows "13 Cr" rather than the rules model's "13.000".
 */

const MINUS = '−'

/** Whole credits for a yocto amount, rounded half up like the rules model. */
export function credits(yocto: bigint): bigint {
  const negative = yocto < 0n
  const abs = negative ? -yocto : yocto
  const whole = abs / CREDIT + (abs % CREDIT >= CREDIT / 2n ? 1n : 0n)
  return negative ? -whole : whole
}

/** "13" — a credit amount without its unit. */
export function cr(yocto: bigint): string {
  const value = credits(yocto)
  return value < 0n ? `${MINUS}${-value}` : `${value}`
}

/** "+3", "−4", "±0" — a signed change in credits. */
export function crDelta(yocto: bigint): string {
  const value = credits(yocto)
  if (value === 0n) return '±0'
  return value > 0n ? `+${value}` : `${MINUS}${-value}`
}

/** "+2", "−1", "±0" for small resource counts. */
export function countDelta(value: number): string {
  if (value === 0) return '±0'
  return value > 0 ? `+${value}` : `${MINUS}${-value}`
}

/** Testnet NEAR with three decimals, e.g. "6.010". */
export function near(yocto: bigint): string {
  return (Number(yocto / 1_000_000_000_000_000_000n) / 1_000_000).toFixed(3)
}

/** "derelictplayer-3cly8" from "derelictplayer-3cly8.derelict-factory.testnet". */
export function stationSlug(account: string): string {
  return account.split('.')[0] || account
}

/** Middle-truncated account for tight spaces. */
export function shortAccount(account: string, max = 22): string {
  if (account.length <= max) return account
  const keep = max - 1
  return `${account.slice(0, Math.ceil(keep * 0.6))}…${account.slice(-Math.floor(keep * 0.4))}`
}
