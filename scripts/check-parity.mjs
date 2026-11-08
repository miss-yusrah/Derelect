#!/usr/bin/env node
// Parity check: the TypeScript model's published strategies must end in the
// exact states published in DERELICT-PLAN.md. Run via: node scripts/check-parity.mjs
import assert from 'node:assert/strict';
import {
  createStation,
  applyAction,
  outcome,
  formatCredits,
} from '../packages/game-model/dist/index.js';
import { INVESTMENT_ROUTE, REPAIR_ROUTE, LOSING_ROUTE, DEMO_SUPPLIER } from '../packages/game-model/dist/fixtures.js';
import { CREDIT } from '../packages/game-model/dist/types.js';

const START_BLOCK = 10n;
const station = () => createStation('station.testnet', 'captain.derelict.testnet', undefined, START_BLOCK);

function run(steps) {
  let s = station();
  for (const step of steps) {
    s = applyAction(s, step.action, START_BLOCK + BigInt(s.turn));
    assert.equal(s.operatingYocto, BigInt(step.credits) * CREDIT, `credits after turn ${step.turn}`);
    assert.equal(s.fuel, step.fuel, `fuel after turn ${step.turn}`);
    assert.equal(s.hull, step.hull, `hull after turn ${step.turn}`);
  }
  return s;
}

const inv = run(INVESTMENT_ROUTE);
assert.equal(inv.served, 4);
assert.equal(formatCredits(inv.operatingYocto), '26.000');
assert.equal(outcome(inv).success, true);

const rep = run(REPAIR_ROUTE);
assert.equal(rep.served, 4);
assert.equal(formatCredits(rep.operatingYocto), '27.000', 'published maximum is 27');
assert.equal(rep.repair.supplier, DEMO_SUPPLIER);
assert.equal(outcome(rep).success, true);

const lose = run(LOSING_ROUTE);
assert.equal(outcome(lose).success, false);
assert.equal(outcome(lose).reason, 'Failed: fewer than 3 ships served');

console.log('PARITY OK: investment 26.000, repair 27.000, losing path rejects.');
