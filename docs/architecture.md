# DERELICT architecture

One station = one NEAR account = one NEP-171 NFT contract. The factory is a
discovery index only. Everything authoritative lives on-chain in the station
contract: game state, money, ownership, and history.

```
Captain / buyer wallet ──┐                     Station account (no keys)
Visitor (ship payer) ────┼→ React bridge ─ NEAR RPC → Contract: NEP-171 + game + treasury
Repair supplier ─────────┘                              │
                                                        ├→ fixed-recipient native payout claims
Factory ─── creates + funds each station once ──────────┘
```

## Ownership model

Single ownership authority: `owner_id` returned by the NEP-171
implementation. The game reads that same value to authorize captain actions;
there is no second "captain" field that could diverge from ownership.

Every ownership change (sale, direct transfer, receiver rollback) increments
`epoch`. Every economically relevant mutation increments `revision`. Player
actions and purchases bind to the current revision; stale submissions reject.

## Treasury buckets

| Bucket | Entitled to | Captain may spend |
| --- | --- | --- |
| `operating` | Station's earned + opening budget | via permitted actions only |
| visitor escrow + refunds | original ship payer | never |
| repair reserve | supplier fixed at purchase | never |
| seller receivable | seller fixed by purchase | never |
| pending disbursements | recipient fixed before the promise | never |
| storage/exec reserve | contract operation | never |

The visible account balance is **not** the score; `operating` is the score.
`get_buckets()` exposes every bucket plus a raw-balance reconciliation
difference so a judge can account for every yoctoNEAR.

## Docking income escrow

Every offer is funded by the visitor **before** the captain acts. Accepting a
standard offer releases only the fee (3 without / 5 with upgrade); the unused
2credit remainder belongs to the payer, forever. Heavy offers release all 8
credits. The contract never mints money when a ship docks.

## Contract-level transfer protections

- `nft_transfer`: plain transfer; epoch++ ; listing voided.
- `nft_transfer_call`: provisional ownership → global `locked` flag stops all
  game mutations, captain spending, listings and purchases until the resolver
  runs. Resolution failure (plain account, reject, forwarding) unlocks and
  rolls back with another epoch bump. Fixed creditor claims (supplier, seller,
  refunds) stay claimable during the locked interval.
- Payouts use a recorded lifecycle (claimable → pending → paid). A failed
  native transfer restores exactly one claimable record; duplicate callbacks
  cannot double-pay because the op record is consumed first and payment
  routing is stored, not derived from the current owner.

## Storage / access key posture

Station accounts are created by the factory with **no access keys**: the
contract is the sole controller of the account. The factory keeps no
spending authority; the wasm is deployed once (fixed code), and station
accounts cannot replace code (no delegate/add-key methods exposed).

## Parity

`packages/game-model` is the TS reference (UI action previews). Both
published strategies are asserted in TS tests, in Rust unit tests, and in
`scripts/check-parity.mjs`. Fixtures shared for scenario constants.
