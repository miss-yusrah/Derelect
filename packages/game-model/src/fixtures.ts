/**
 * Shared fixtures for both the TypeScript model and the Rust contracts.
 *
 * Both published strategies from DERELICT-PLAN.md must reproduce the exact
 * states in the plan's strategy table. Run by scripts/check-parity.mjs.
 */

import type { ActionKind } from './types.js';

export interface StrategyStep {
  turn: number;
  action: ActionKind;
  /** Expected operating credits, fuel and hull AFTER the step. */
  credits: number;
  fuel: number;
  hull: number;
}

/** Supplier account used by the demo repair route. */
export const DEMO_SUPPLIER = 'supplier.derelict.testnet';
/** Demo buyer account for the mid-campaign sale. */
export const DEMO_BUYER = 'buyer.derelict.testnet';

/** Investment route: upgrade first, then four standard dockings, wait. */
export const INVESTMENT_ROUTE: StrategyStep[] = [
  { turn: 1, action: { kind: 'upgradeDock' }, credits: 6, fuel: 4, hull: 2 },
  { turn: 2, action: { kind: 'standardDocking' }, credits: 11, fuel: 3, hull: 2 },
  { turn: 3, action: { kind: 'standardDocking' }, credits: 16, fuel: 2, hull: 2 },
  { turn: 4, action: { kind: 'standardDocking' }, credits: 21, fuel: 1, hull: 2 },
  { turn: 5, action: { kind: 'standardDocking' }, credits: 26, fuel: 0, hull: 2 },
  { turn: 6, action: { kind: 'wait' }, credits: 26, fuel: 0, hull: 2 },
];

/** Repair route: the main judging scenario. The sale goes between turns 3 and 4. */
export const REPAIR_ROUTE: StrategyStep[] = [
  { turn: 1, action: { kind: 'standardDocking' }, credits: 13, fuel: 3, hull: 2 },
  { turn: 2, action: { kind: 'heavyDocking' }, credits: 21, fuel: 1, hull: 1 },
  {
    turn: 3,
    action: { kind: 'commissionRepair', supplier: DEMO_SUPPLIER },
    credits: 17,
    fuel: 1,
    hull: 1,
  },
  { turn: 4, action: { kind: 'refuel', units: 3 }, credits: 11, fuel: 4, hull: 3 },
  { turn: 5, action: { kind: 'heavyDocking' }, credits: 19, fuel: 2, hull: 2 },
  { turn: 6, action: { kind: 'heavyDocking' }, credits: 27, fuel: 0, hull: 1 },
];

/** A genuine losing path: spends turns and money without serving a single ship. */
export const LOSING_ROUTE: StrategyStep[] = [
  { turn: 1, action: { kind: 'refuel', units: 2 }, credits: 6, fuel: 6, hull: 2 },
  { turn: 2, action: { kind: 'upgradeDock' }, credits: 2, fuel: 6, hull: 2 },
  { turn: 3, action: { kind: 'wait' }, credits: 2, fuel: 6, hull: 2 },
  { turn: 4, action: { kind: 'wait' }, credits: 2, fuel: 6, hull: 2 },
  { turn: 5, action: { kind: 'wait' }, credits: 2, fuel: 6, hull: 2 },
  { turn: 6, action: { kind: 'wait' }, credits: 2, fuel: 6, hull: 2 },
];

/**
 * The judging sale script: repair route with the sale inserted between
 * turns 3 and 4, plus the old-captain rejection check after the handover.
 */
export interface JudgingSalePlan {
  route: StrategyStep[];
  listAtTurn: number;
  listPriceCredits: number;
}

export const JUDGING_SALE: JudgingSalePlan = {
  route: REPAIR_ROUTE,
  listAtTurn: 3,
  listPriceCredits: 15,
};
