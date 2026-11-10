# Judge's guide — DERELICT

## What to believe in 90 seconds

1. Open the app. It shows the showcase station
   `isa02.derelict-factory.testnet` read-only. Every number on screen is a
   contract view — there is no practice mode or simulator.
2. Click **Connect wallet** and use your own NEAR testnet wallet (Meteor,
   Intear, …). You need about 6.1 testnet NEAR; it is free from
   [near-faucet.io](https://near-faucet.io/).
3. Click **Launch station**. Two wallet approvals: `create_station` on the
   factory creates a keyless station account owned by you (6 NEAR storage +
   10 Cr opening funds), then one transaction prepays the 12 visiting ships
   (78 Cr escrow, refundable if unused). The station is a real NEAR account
   whose contract owns its own money.
4. Play turns 1–2: a docking fee is paid by a previously funded visitor escrow
   and lands in the station's operating funds. Fuel drops, hull takes damage.
5. Turn 3: commission a repair, naming a supplier account you control (for
   example a second testnet wallet). 4 credits move from operating to a
   protected reserve — visible in the left rail and in `get_buckets()`.
6. Handover: **Inspect / List** → list the station; in a second browser
   profile, connect another wallet and buy it while the repair is unfinished.
   Ownership transfers, an epoch increments, and every resource + obligation
   persists. The purchase price was paid to the seller, not to operations.
7. Old controller loses command: the rail reads the NFT owner and only offers
   Inspect, and the contract's `assert_captain` rejects `act` from that
   account — authority genuinely follows the NFT owner.
8. Turn 4: the new captain refuels; the repair effect lands (hull restored).
9. Supplier settlement: connect the supplier wallet and click
   **Claim repair fee** — the sale could not redirect or erase the obligation.
10. Turns 5–6: finish the campaign (inspect the outcome: success + score).
11. Evidence: open the ledger drawer for the transaction history; inspect
    `get_buckets()` and see every yoctoNEAR accounted for, plus the station
    account's access keys: none — the contract is the sole controller.

Every launched station is listed by the factory's `get_stations()`; the
**Launch station** dialog shows the ones your wallet launched so you can
reopen them.

## Reproduce locally

```bash
git clone <repo> && cd Derelect
pnpm install
pnpm --filter @derelict/game-model build
pnpm --filter @derelict/game-model test   # published strategies verify (26 / 27 Cr)
cargo test -p derelict-station    # 18 unit tests incl. mid-repair sale scenario
pnpm --filter derelict-web dev    # connect a NEAR testnet wallet to play
```

## On-chain verification snippets

```bash
# full state incl. owner, revision, epoch, repair
near contract call-function as-read-only "$STATION" get_state json-args '{}' \
  network-config testnet at-run

# treasury buckets + raw balance reconciliation
near contract call-function as-read-only "$STATION" get_buckets json-args '{}' \
  network-config testnet at-run

# access keys: must be EMPTY (contract-only control)
# (Explorer > "$STATION" > Access Keys)
```

## Key contract methods

- views: `get_state`, `get_offers`, `get_best_offer(kind)`, `get_ledger`, `get_buckets`, `nft_metadata`, NEP-171 enumeration (`nft_token(s)`, `nft_total_supply`, `nft_supply_for_owner`)
- captain: `act(action, expected_revision)`
- visitor: `fund_offer(kind)` (payable), `reclaim_offer(id)`, `claim_refund()`
- supplier: `claim_repair()`
- seller: `claim_seller_proceeds()`
- transfer/sale: `list_for_sale`, `unlist`, `purchase(expected_revision)` (payable), NEP-171 `nft_transfer` / `nft_transfer_call` + `nft_resolve_transfer`

## Account roles

| Role | Purpose |
| --- | --- |
| captain (owner) | launches the station, plays turns, lists it |
| buyer | inspects + purchases mid-repair |
| visitor | funds the 12 prepaid offers (0.078 NEAR) — the launching captain does this in-app |
| supplier | collects the 4-credit repair fee after its block threshold |

Account identities are labeled in the UI and ledger. No simulator ever
replaces a live balance or a pending transaction: pending stays pending until
the chain confirms.
