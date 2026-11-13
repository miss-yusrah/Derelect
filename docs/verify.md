# Verifying a station on chain

Everything the DERELICT app shows comes from the station contract. This page
shows how to check the same facts yourself with
[near-cli-rs](https://github.com/near/near-cli-rs), and which contract methods
exist.

Set `STATION` to the station account shown in the app header, for example:

```bash
STATION=<name>.derelict-factory.testnet
```

## State, money and history

```bash
# owner, turn, fuel, hull, revision, epoch, repair, listing
near contract call-function as-read-only "$STATION" get_state json-args '{}' \
  network-config testnet now

# treasury buckets plus a reconciliation against the raw account balance
near contract call-function as-read-only "$STATION" get_buckets json-args '{}' \
  network-config testnet now

# the entries the app's Ledger shows
near contract call-function as-read-only "$STATION" get_ledger \
  json-args '{"from_index": "0", "limit": 50}' network-config testnet now

# prepaid visitor offers
near contract call-function as-read-only "$STATION" get_offers json-args '{}' \
  network-config testnet now
```

The station account has **no access keys** — only its contract can move its
money. Check this in a NEAR explorer under the station's access keys.

## What to look for

- **The score is the operating bucket**, not the account balance. The account
  also holds the contract's storage reserve, visitor escrow and anything owed.
- **A sale keeps every obligation.** After a purchase, `get_state` shows the
  new owner and a higher epoch; the repair reserve and its supplier are
  unchanged, and the seller's proceeds appear as a receivable.
- **Authority follows the owner.** `act` from any account other than the
  current owner is rejected by the contract.
- **Nothing is simulated.** The app updates only after reading the new
  revision back from the chain.

## Contract methods

- Views: `get_state`, `get_offers`, `get_best_offer(kind)`, `get_ledger`,
  `get_buckets`, `get_owner`, `nft_metadata`, NEP-171 enumeration
  (`nft_token(s)`, `nft_total_supply`, `nft_supply_for_owner`)
- Captain: `act(action, expected_revision)`, `list_for_sale`, `unlist`
- Buyer: `purchase(expected_revision)` (attach the exact listed price)
- Visitor: `fund_offer(kind)` (attach 5 or 8 credits), `reclaim_offer(id)`,
  `claim_refund()`
- Repair supplier: `claim_repair()`
- Seller: `claim_seller_proceeds()`
- NEP-171 transfer: `nft_transfer`, `nft_transfer_call`, `nft_resolve_transfer`

Stations are created by the factory (`derelict-factory.testnet`):
`create_station(name, captain, scenario)`, and listed by `get_stations()`.

## Roles

| Role | What they do |
| --- | --- |
| Captain (owner) | launches the station, plays its turns, can list it for sale |
| Buyer | purchases a listed station and continues its campaign |
| Visitor | prepays docking offers; in the app the captain funds them at launch |
| Repair supplier | collects the 4-credit repair fee once its block threshold passes |
