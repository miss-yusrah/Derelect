import {
  createStation,
  applyAction,
  listForSale,
  unlist,
  purchase,
  type ActionKind,
  type StationState,
  type HistoryEvent,
} from '@derelict/game-model'
import {
  PRACTICE_BUYER,
} from '../config'

/**
 * Practice mode persistence and transitions. Everything is local: the model
 * is the full authority and localStorage snapshots keep a run alive across
 * refreshes.
 */

export const PRACTICE_STORAGE_KEY = 'derelict.practice.v1'

/** Practice "chain clock": a stable fake block height. */
export function practiceBlockHeight(state: StationState): bigint {
  return 1_000_000n + BigInt(state.revision) * 5n
}

/* ------------------------------------------------------------------ */
/* Serialization (bigints survive via tagged JSON)                     */
/* ------------------------------------------------------------------ */

export function serializePractice(state: StationState): string {
  return JSON.stringify(state, (_key, value: unknown) => {
    if (typeof value === 'bigint') return { $bigint: value.toString() }
    return value
  })
}

export function parsePractice(json: string): StationState | null {
  try {
    const revived = JSON.parse(json, (_key, value: unknown) => {
      if (
        value !== null &&
        typeof value === 'object' &&
        typeof (value as { $bigint?: string }).$bigint === 'string'
      ) {
        return BigInt((value as { $bigint: string }).$bigint)
      }
      return value
    }) as StationState
    if (
      typeof revived?.operatingYocto !== 'bigint' ||
      typeof revived?.turn !== 'number' ||
      typeof revived?.fuel !== 'number'
    ) {
      return null
    }
    return revived
  } catch {
    return null
  }
}

export function loadPractice(): StationState | null {
  try {
    const blob = window.localStorage.getItem(PRACTICE_STORAGE_KEY)
    return blob ? parsePractice(blob) : null
  } catch {
    return null
  }
}

export function savePractice(state: StationState): void {
  try {
    window.localStorage.setItem(PRACTICE_STORAGE_KEY, serializePractice(state))
  } catch {
    /* storage unavailable — practice run lives in memory for the session */
  }
}

export function clearPractice(): void {
  try {
    window.localStorage.removeItem(PRACTICE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Local transitions (practice mode uses the model directly)           */
/* ------------------------------------------------------------------ */

export class PracticeActionFailed extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PracticeActionFailed'
  }
}

/** Apply one gameplay action, or throw with the exact model error text. */
export function practiceAct(state: StationState, action: ActionKind): StationState {
  try {
    return applyAction(state, action, practiceBlockHeight(state))
  } catch (error) {
    throw new PracticeActionFailed(error instanceof Error ? error.message : String(error))
  }
}

export function practiceList(state: StationState, priceYocto: bigint): StationState {
  return withFreshHistory(listForSale(state, priceYocto))
}

export function practiceUnlist(state: StationState): StationState {
  return withFreshHistory(unlist(state))
}

export function practicePurchase(state: StationState): StationState {
  try {
    return withFreshHistory(
      purchase(state, PRACTICE_BUYER, state.listing?.priceYocto ?? 0n, state.revision),
    )
  } catch (error) {
    throw new PracticeActionFailed(error instanceof Error ? error.message : String(error))
  }
}

function withFreshHistory(next: StationState): StationState {
  // Store-inspection safety: dates/numbers are already plain in HistoryEvent.
  return next
}

export type { HistoryEvent, StationState }
