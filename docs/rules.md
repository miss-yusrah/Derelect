# DERELICT rules (frozen)

## Objective

Six gameplay turns. Win by finishing with hull ≥ 1 and ≥ 3 ships served.
Score = final operating treasury (max 27 credits with the starting scenario
under these rules, verified by enumeration and by the transition model).

A gameplay action consumes one turn. Selling, buying, funding offers,
claiming payments and observing the station consume no turns. A rejected
action consumes nothing.

## Starting state (standard salvage)

10 credits operating funds, 4 fuel, 2 hull, no upgrade, no repair, 0 served.
Fuel capacity 6, hull capacity 3.

**One credit = 0.001 testnet NEAR = 10^21 yoctoNEAR.** Credits are a display
unit, not a token. Money is stored as integer yoctoNEAR end to end.

## Actions

| Action | Cost | Result | Conditions |
| --- | --- | --- | --- |
| Standard docking | 1 fuel | earn 3 Cr (5 with dock upgrade); serve 1 | hull ≥ 1; eligible prepaid standard offer |
| Heavy docking | 2 fuel + 1 hull | earn 8 Cr; serve 1 | hull ≥ 1; eligible prepaid heavy offer |
| Refuel | 2 Cr per unit, 1–4 units | fuel + units | funds sufficient; fuel ≤ 6 |
| Commission repair | reserve 4 Cr | restore 2 hull (cap 3) after next **valid** action | no active repair; hull < 3; not on turn 6 |
| Upgrade dock | 4 Cr | standard fee becomes 5 Cr | once per campaign |
| Wait | — | advance turn; may deliver a due repair | turn ≤ 6 |

Heavy docking may reduce hull from 1 to 0. At hull 0 docking is disabled, but
refuel / repair / upgrade / wait remain legal. Game damage never touches the
NEAR account or any financial claim.

## Repair timing and payment

Commission repair on turn N → effect after the turn-(N+1)**valid** action
(never during its own action; rejected actions do not advance repairs). On
turn 6 a due effect is processed before evaluating the outcome.

The repair reserve (4 Cr) is a protected obligation: supplier fixed at
purchase, effect timing fixed, payment eligibility fixed at a block-height
threshold recorded at purchase. Claiming does not advance gameplay; applying
the hull effect does not pay. Both survive any ownership transfer.

## Money validity

- Every earned docking fee is backed by a previously escrowed offer.
- Unused standard-offer escrow (2 Cr when not upgraded / already priced in
  when upgraded) belongs to the visiting ship; acceptance and refund can
  never both succeed.
- Expired or campaign-unclaimed offers are reclaimable by the payer.
- Sale purchase price is paid to the seller and never funds operations.
- Operating withdrawals: after campaign completion only; no mid-campaign
  top-ups or withdrawals.
