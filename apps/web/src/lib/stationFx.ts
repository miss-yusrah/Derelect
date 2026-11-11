import type { ActionKind } from '@derelict/game-model'
import type { GameSnapshot, LedgerRow } from './state'

/**
 * Presentation events for the station canvas. They are derived only from
 * two consecutive chain read-backs of the same station, so nothing plays for
 * a pending or failed transaction, and a page reload (no previous read)
 * restores the current state without replaying anything.
 */

export type ModuleId = 'reactor' | 'dock' | 'repair'

export interface StationFx {
  /** Module whose transaction is submitted and awaiting the chain. */
  pendingModule: ModuleId | null
  /** A rejected or failed action; `module` null means the whole station. */
  failure: { module: ModuleId | null; text: string; key: number } | null
  /** Confirmed docking: ship arrival plays once per key. */
  arrival: number | null
  /** Confirmed repair effect: hull restoration plays once per key. */
  restoration: number | null
  /** Confirmed ownership change: badge swap shows the previous captain. */
  ownerSwap: { previous: string; key: number } | null
  /** Ledger rows with a higher sequence arrived in this session. */
  newAfterSequence: number | null
  /** Hold the new-row highlight until a ship arrival has played. */
  ledgerDelayMs: number
}

export const NO_FX: StationFx = {
  pendingModule: null,
  failure: null,
  arrival: null,
  restoration: null,
  ownerSwap: null,
  newAfterSequence: null,
  ledgerDelayMs: 0,
}

/** The station module an action visibly affects, if any. */
export function moduleForAction(kind: ActionKind['kind']): ModuleId | null {
  switch (kind) {
    case 'standardDocking':
    case 'heavyDocking':
    case 'upgradeDock':
      return 'dock'
    case 'commissionRepair':
      return 'repair'
    case 'refuel':
      return 'reactor'
    case 'wait':
      return null
  }
}

const DOCKING_KINDS = new Set(['standardDocking', 'heavyDocking'])

export interface ConfirmedChanges {
  docked: boolean
  repaired: boolean
  previousOwner: string | null
  newAfterSequence: number | null
}

/** What the chain confirmed between two reads of the same station. */
export function confirmedChanges(
  previous: { snapshot: GameSnapshot; rows: LedgerRow[] },
  next: { snapshot: GameSnapshot; rows: LedgerRow[] },
): ConfirmedChanges {
  const lastSeen = previous.rows.reduce((max, row) => Math.max(max, row.sequence), 0)
  const fresh = next.rows.filter((row) => row.sequence > lastSeen)
  return {
    docked: fresh.some((row) => DOCKING_KINDS.has(row.kind)),
    repaired: fresh.some((row) => row.kind === 'repairEffect'),
    previousOwner: previous.snapshot.owner !== next.snapshot.owner ? previous.snapshot.owner : null,
    newAfterSequence: fresh.length > 0 ? lastSeen : null,
  }
}
