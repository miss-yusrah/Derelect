# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Players** with a NEAR testnet wallet, usually on a laptop, playing one short campaign: six turns, each confirmed in their wallet. Many are trying NEAR for the first time and need the rules, money and wallet steps to be legible without reading docs.
- **Hackathon judges and reviewers** who open a station read-only (`?station=<account>`), check that the state is real on-chain, and may play a run themselves. *(Inferred from the README and repo description.)*

## Product Purpose

DERELICT is a six-turn strategy game about running a battered orbital salvage station: dock visiting ships for credits, manage fuel and hull damage, and decide when a repair is worth it. The score is the money left in the station's operating treasury after turn 6. A run wins when the hull survives (≥ 1) and at least three ships were served.

## Positioning

Each station is a real NEAR account and a NEP-171 NFT that owns its own money: operating treasury, visitor escrow, repair reserve and seller proceeds are held by the station itself. Selling a station mid-campaign hands the buyer its fuel, damage, treasury and unpaid repair bill while the original supplier still gets paid.

## Operating Context

- Every move is a wallet-signed transaction; the screen changes only after the chain confirms it (never optimistic). Pending, rejected and stale-revision states are part of normal play.
- Launch takes two wallet approvals: create the station (≈ 6.01 NEAR, mostly storage), then fund 12 visiting ships (78 Cr escrow).
- Selling, buying, funding visitors and claiming payouts do not use turns.

## Capabilities and Constraints

- Actions: standard docking (1 fuel → +3 Cr, +5 with upgraded dock), heavy docking (2 fuel + 1 hull → +8 Cr), refuel (2 Cr/unit, 1–4), commission repair (4 Cr reserved → +2 hull after the next action), upgrade dock (4 Cr, once), wait.
- Capacities: fuel 6, hull 3. Start: 10 Cr, 4 fuel, 2 hull. Best possible score: 27 Cr.
- 1 credit = 0.001 testnet NEAR. Credits are whole numbers on chain.
- Stack: React 18 + Vite, `@derelict/game-model` for rule previews, NEAR wallet via `@hot-labs/near-connect`.

## Brand Commitments

- Name: DERELICT. Tagline from the README: "Buy the station. Inherit its condition and commitments."
- The painted station illustration and its cut-out layers (solar wings, drone) in `src/assets/` are the product's only art.

## Evidence on Hand

- Live testnet stations from the factory `derelict-factory.testnet` (finished and in-progress campaigns).
- No player counts, testimonials or press exist; do not invent any.

## Product Principles

1. Chain truth first: never show a state the chain has not confirmed.
2. The game reads before the plumbing: rules, money and the next move come first; contract details stay one click away for people who verify.
3. Every cost is visible before you sign.
