# Judge's guide — DERELICT

## What to believe in 90 seconds

1. Open the app. The header shows the live station account
   `isa02.derelict-factory.testnet`; the rail is read-only until you click
   **Connect wallet** and pick a NEAR testnet wallet.
2. The station is a real NEAR account whose contract owns its own money. The
   ledger, treasury and every number on screen are contract views — there is no
   practice mode or simulator.
3. Play turns 1–2: a docking fee is paid by a previously funded visitor escrow
   and lands in the station's operating funds. Fuel drops, hull takes damage.
4. Turn 3: commission a repair. 4 credits move from operating to a protected
   reserve — visible in the left rail and in `get_buckets()`.
5. Handover: a second account buys the station while the repair is unfinished.
   Ownership transfers, an epoch increments, and every resource + obligation
   persists. The purchase price was paid to the seller, not to operations.
6. Old controller loses command: the rail reads the NFT owner and only offers
   Inspect, and the contract's `assert_captain` rejects `act` from that
   account — authority genuinely follows the NFT owner.
7. Turn 4: the new captain refuels; the repair effect lands (hull restored).
8. Supplier settlement: connect the **original** supplier's wallet and click
   **Claim repair fee** — the sale could not redirect or erase the obligation.
9. Turns 5–6: finish the campaign (inspect the outcome: success + score).
10. Evidence: open the ledger drawer for the transaction history; inspect
    `get_buckets()` and see every yoctoNEAR accounted for, plus the station
    account's access keys: none — the contract is the sole controller.

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

## Demo account roles (all testnet demo traffic)

| Role | Purpose |
| --- | --- |
| captain (owner) | plays turns, lists station |
| buyer | inspects + purchases mid-repair |
| visitor | funds the 12 prepaid offers (0.078 NEAR) |
|supplier | collects the 4-credit repair fee after its block threshold |

Account identities are labeled in the UI and ledger. No simulator ever
replaces a live balance or a pending transaction: pending stays pending until
the chain confirms.
