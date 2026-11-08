#!/usr/bin/env bash
# Fresh judging run: create a station, seed the six standard + six heavy
# visitor offers (0.078 NEAR total from the demo visitor account), and print
# the accounts and walkthrough steps for the evidence drawer.
# Usage: scripts/fresh-run-station.sh <name> [captain] [visitor] [supplier]
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=${1:?station name, e.g. isa-01}
FACTORY_ACCOUNT=${FACTORY_ACCOUNT:?env FACTORY_ACCOUNT}
FACTORY_KEY_ACCOUNT=${PLAYER_ACCOUNT:?env PLAYER_ACCOUNT (factory operator/captain)}
VISITOR=${2:-${VISITOR_ACCOUNT:-visitor.derelict.testnet}}
CAPTAIN=${3:-${PLAYER_ACCOUNT}}
SUPPLIER=${4:-${SUPPLIER_ACCOUNT:-supplier.derelict.testnet}}

STATION="${NAME}.${FACTORY_ACCOUNT}"
echo "== Creating station ${STATION} =="
near contract call-function as-transaction "${FACTORY_ACCOUNT}" create_station \
  json-args "{\"name\": \"${NAME}\", \"captain\": \"${CAPTAIN}\", \"scenario\": \"standard-salvage\"}" \
  prepaid-gas '100.0 Tgas' attached-deposit '6.021 NEAR' \
  sign-as "${PLAYER_ACCOUNT}" network-config testnet sign-with-key-pair --sign-with-access-key-file ./neardev/${PLAYER_ACCOUNT}.json send

echo "== Funding visitor offers (6 standard x 0.005 NEAR + 6 heavy x 0.008 NEAR) =="
for i in 1 2 3 4 5 6; do
  near contract call-function as-transaction "${STATION}" fund_offer \
    json-args '{"kind":"Standard"}' prepaid-gas '30.0 Tgas' attached-deposit '0.005 NEAR' \
    sign-as "${VISITOR}" network-config testnet send | tail -1
  near contract call-function as-transaction "${STATION}" fund_offer \
    json-args '{"kind":"Heavy"}' prepaid-gas '30.0 Tgas' attached-deposit '0.008 NEAR' \
    sign-as "${VISITOR}" network-config testnet send | tail -1
done

echo "== Verify: no access keys on the station account (contract is sole controller) =="
near network view-access-keys "${STATION}" network-config testnet || \
  near keys "${STATION}" || true

STATE=$(near contract call-function as-read-only "${STATION}" get_state json-args '{}' prepaid-gas '10 Tgas' network-config testnet at-run 2>/dev/null || true)
echo "STATION=${STATION}"
echo "STATE=${STATE}"
echo
echo "Judge walkthrough (see docs/judging.md): turns 1-3, sale to a second account, old captain rejection, turn 4 refuel + repair effect, supplier claim, turns 5-6 heavy dockings."
