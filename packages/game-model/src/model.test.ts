import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStation,
  applyAction,
  previewActionAtBlock,
  purchase,
  listForSale,
  bestEligibleOffer,
  outcome,
  markRepairPaid,
  reclaimOffer,
  ActionError,
  type StationState,
  type StrategyStep,
} from './model.js';
import { CREDIT } from './types.js';
import { formatCredits } from './format.js';
import { INVESTMENT_ROUTE, REPAIR_ROUTE, LOSING_ROUTE, DEMO_BUYER, DEMO_SUPPLIER } from './fixtures.js';

const START_BLOCK = 10n;
const station = () => createStation('station.testnet', 'captain.derelict.testnet', undefined, START_BLOCK);

interface StepResult {
  state: StationState;
  preview: ReturnType<typeof previewActionAtBlock>;
}

/**
 * Assert each reported turn state matches the plan table AFTER the action.
 * Also verifies that the action was legal (preview) before it was applied.
 */
function runRoute(state: StationState, steps: StrategyStep[]): StepResult {
  let s = state;
  for (const step of steps) {
    const pv = previewActionAtBlock(s, step.action, START_BLOCK + BigInt(s.turn));
    assert.equal(pv.ok, true, `turn ${step.turn} (${step.action.kind}) should be legal: ${pv.error}`);
    s = applyAction(s, step.action, START_BLOCK + BigInt(s.turn));
    assert.equal(s.turn, step.turn + 1, `turn advanced by ${step.action.kind}`);
    assert.equal(s.operatingYocto, BigInt(step.credits) * CREDIT, `credits after turn ${step.turn} (${step.action.kind})`);
    assert.equal(s.fuel, step.fuel, `fuel after turn ${step.turn} (${step.action.kind})`);
    assert.equal(s.hull, step.hull, `hull after turn ${step.turn} (${step.action.kind})`);
  }
  return { state: s, preview: null as never };
}

test('investment route reproduces the plan table (26 credits, 4 served)', () => {
  const s = runRoute(station(), INVESTMENT_ROUTE).state;
  const o = outcome(s);
  assert.equal(o.success, true);
  assert.equal(o.scoreYocto, 26n * CREDIT);
  assert.equal(formatCredits(s.operatingYocto), '26.000');
});

test('repair route reproduces the plan table (27 credits, 4 served, hull 1)', () => {
  const s = runRoute(station(), REPAIR_ROUTE).state;
  assert.equal(s.served, 4);
  assert.equal(s.repair!.effectApplied, true);
  assert.equal(s.repair!.supplier, DEMO_SUPPLIER);
  assert.equal(s.repair!.paid, false, 'supplier claim is still live after campaign end');
  const o = outcome(s);
  assert.equal(o.success, true);
  assert.equal(o.scoreYocto, 27n * CREDIT, '27 is the published maximum');
});

test('losing path fails only on ships served, not on hull', () => {
  const s = runRoute(station(), LOSING_ROUTE).state;
  const o = outcome(s);
  assert.equal(o.complete, true);
  assert.equal(o.success, false);
  assert.equal(o.reason, 'Failed: fewer than 3 ships served');
});

test('judging sale flow: mid-repair sale; new captain continues; old supplier still claimable', () => {
  let s = runRoute(station(), REPAIR_ROUTE.slice(0, 3)).state; // turns 1..3
  assert.equal(s.repair!.reserveYocto, 4n * CREDIT, '4 protected credits after commissioning');

  // Sale between turns 3 and 4. Consumes no turn, preserves everything.
  s = listForSale(s, 15n * CREDIT);
  s = purchase(s, DEMO_BUYER, 15n * CREDIT, s.revision);
  assert.equal(s.owner, DEMO_BUYER);
  assert.equal(s.epoch, 2, 'ownership epoch incremented');
  assert.equal(s.turn, 4, 'sale did not consume a turn');
  assert.equal(s.hull, 1);
  assert.equal(s.fuel, 1);
  assert.equal(s.operatingYocto, 17n * CREDIT, 'sale does not fund operations');
  assert.equal(s.sellerReceivables['captain.derelict.testnet'], 15n * CREDIT, 'seller has a fixed receivable');

  // New captain plays turns 4..6; the plan table must hold identically.
  s = runRoute(s, REPAIR_ROUTE.slice(3)).state;
  assert.equal(s.operatingYocto, 27n * CREDIT, 'the sale changed none of the figures');
  assert.equal(s.repair!.supplier, DEMO_SUPPLIER, 'original supplier survives the sale');
  assert.equal(s.repair!.effectApplied, true);
  assert.equal(s.repair!.paid, false, 'supplier gets its fee even after the captain changed');
  assert.equal(outcome(s).success, true);

  // Supplier settles after campaign end: fee to supplier, not to the score.
  let after = markRepairPaid(s);
  assert.equal(after.repair!.paid, true);
  assert.equal(after.operatingYocto, 27n * CREDIT, 'supplier payment does not create operating funds');
});

test('failed actions change nothing and consume no turn', () => {
  const s = station();
  const before = `${s.turn}:${s.revision}:${s.fuel}:${s.hull}:${s.operatingYocto}`;
  assert.throws(() => applyAction(s, { kind: 'refuel', units: 999 as never }, START_BLOCK), ActionError);
  assert.equal(`${s.turn}:${s.revision}:${s.fuel}:${s.hull}:${s.operatingYocto}`, before);
  assert.equal(s.history.length, 1, 'no ledger entry for a rejected action');
});

test('heavy docking is legal at hull 1 even though it may drop it to 0', () => {
  // Hand-craft the funds state: standard + heavy docking left hull 1.
  let s = station();
  s = applyAction(s, { kind: 'standardDocking' }, START_BLOCK);
  s = applyAction(s, { kind: 'heavyDocking' }, START_BLOCK); // hull 2 -> 1, fuel 1
  // In practice the player refuels to 2 first; point is ruling on hull alone.
  const fuelled: StationState = { ...s, fuel: 2 };
  const pv = previewActionAtBlock(fuelled, { kind: 'heavyDocking' }, START_BLOCK);
  assert.equal(pv.ok, true, 'hull 1 heavy docking allowed; 1 to 0 is a legal outcome');
  // Docking at the rule boundary remains legal, but hull 0 locks docking.
  const broken: StationState = { ...s, hull: 0, fuel: 2 };
  assert.equal(previewActionAtBlock(broken, { kind: 'heavyDocking' }, START_BLOCK).ok, false);
});

test('visitor refund: standard offer releases only the fee, remainder stays the payer’s', () => {
  let s = station();
  s = applyAction(s, { kind: 'standardDocking' }, START_BLOCK);
  const payer = s.offers.find((o) => o.used)!.payer;
  assert.equal(s.visitorRefundable[payer], 2n * CREDIT);
  // Original supply-side invariant: total money conserved.
  assert.equal(
    s.operatingYocto - 10n * CREDIT + s.visitorRefundable[payer],
    5n * CREDIT,
    'released fee + refund == escrowed amount',
  );
});

test('an offer funds exactly one docking: accepted offers vanish from eligibility', () => {
  const s = station();
  const before = bestEligibleOffer(s, 'standard')!.id;
  const s2 = applyAction(s, { kind: 'standardDocking' }, START_BLOCK);
  assert.notEqual(bestEligibleOffer(s2, 'standard')!.id, before);
});

test('reclaim: expired-but-unused offers refund the payer; used ones never refund twice', () => {
  let s = station();
  s = applyAction(s, { kind: 'standardDocking' }, START_BLOCK);
  const unusedExpired = s.offers.find((o) => o.used)!; // first standard offer is now used
  assert.throws(() => reclaimOffer(s, unusedExpired.id, unusedExpired.expiryBlock + 1n), ActionError);

  // An unused, expired offer refunds fully to the payer.
  const open = s.offers.find((o) => !o.used)!;
  s = reclaimOffer(s, open.id, open.expiryBlock + 1n);
  assert.equal(s.visitorRefundable[open.payer], open.escrowYocto + 2n * CREDIT);
  assert.equal(s.operatingYocto, 13n * CREDIT, 'refund never takes operating funds');
  // Acceptance and refund cannot both succeed: the used offer is not payable.
});

test('stale purchase rejects on revision change', () => {
  let s = station();
  s = listForSale(s, 15n * CREDIT);
  assert.throws(() => purchase(s, DEMO_BUYER, 15n * CREDIT, s.revision + 1), ActionError);
});
