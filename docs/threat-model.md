# Threat model (station as an account-NFT)

Adversaries: current/former captains, malicious receiver contracts, visitors
racing reclaims, self-pay redirection attempts, griefing the score.

## Invariants enforced by the contract

1. **One ownership authority.** `owner_id` is the only authority. The former
   captain's identical instruction rejects after a transfer.
2. **Locked interval for receiver transfers.** Between
   `nft_transfer_call` and `nft_resolve_transfer` a provisional owner cannot
   `act`, `list_for_sale`, `purchase`, or `fund_offer`. Resolution failure
   rolls ownership back (epoch++ each change). Fixed creditor claims remain
   live throughout.
3. **No money creation by the game.** Docking fees come from previously
   escrowed offers; `operating` only moves between buckets or from payer
   escrow. `get_buckets()` reconciles raw balance to buckets.
4. **Exactly-once payouts.** Pending op records are consumed before callback;
   a failed native transfer restores one claimable record; second callbacks
   find nothing.
5. **Fixed recipients.** Payout routing is stored on the op/claim, never the
   current owner; a sale cannot redirect supplier/refund/proceeds claims.
6. **Quote freshness.** `act` and `purchase` bind to `revision`; any
   intervening economic change invalidates stale submissions.
7. **Same-account transfer rejected.** No path forwards the station to its
   own account (it would converge ownership with storage and break
   authorization assumptions).
8. **No backdoors.** Station accounts are created without access keys; the
   factory retains no station spending authority; code replacement / account
   deletion methods are not exposed by the fixed station wasm.

## Known trade-offs (documented, not hidden)

- Ledger history is capped implicitly by gameplay structure (≤ ~6 actions +
  financial mutations per fresh station); no unbounded iteration surfaces.
- Excess refunds (dust) use a simple promise; if a recipient cannot receive,
  the dust stays contract-owned and is shown in the unclassified balance.
- Approval management (NEP-178) is out of scope; `nft_transfer_call` to
  arbitrary contracts is supported with standard resolve semantics.
