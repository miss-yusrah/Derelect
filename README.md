# DERELICT

**Buy the station. Inherit its condition and commitments.**

DERELICT is a six-turn orbital salvage strategy game for the NEAR hackathon track
*NFTs That Do Something*. Every station is a real NEAR account backed by an
NFT (NEP-171) that **owns its own money**: it holds operating funds, visitor
escrow, and repair obligations. You can sell the operating station mid-contract —
the new captain inherits fuel, damage, history, and the original supplier's claim.

> This is the working repository. Full execution plan: [`DERELICT-PLAN.md`](./DERELICT-PLAN.md)

## Repository layout

```text
contracts/station/        Station NFT, game, treasury, offers and sale
contracts/factory/        Station deployment and discovery
apps/web/                 Game interface and wallet integration
packages/game-model/      Pure transition model, fixtures and previews
tests/integration/        Sandbox, receiver and payout-failure scenarios
scripts/                  Build, deploy, seed, inspect and fresh-demo commands
docs/                     Architecture, threat model, rules and judging guide
design/                   Concept art and image-generation record
```

## Status

- [x] Plan frozen (`DERELICT-PLAN.md`)
- [ ] Shared transition model and fixtures
- [ ] Station contract: ownership, resources, ledger buckets
- [ ] Docking offers, repair, upgrade
- [ ] Sale, epochs, payout lifecycle
- [ ] Web interface
- [ ] Testnet deployment + demo

## Tracks

- **Primary:** NFTs That Do Something (dynamic NFT — NEP-171 + sub-accounts)
- **Secondary:** Games With Real Economies
