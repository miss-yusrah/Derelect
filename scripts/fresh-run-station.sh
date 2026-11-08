#!/usr/bin/env bash
# Deploy the factory + a fresh station to NEAR testnet, then seed demo offers.
#
# Factories/stations and the judge's guide: docs/judging.md.
#
# Prerequisites:
#   cargo install near-cli-rs
#   Files (gitignored, neardev/):
#     neardev/<account>.key.txt  — output of `near account create-account ...`
#                                  (contains SECRET KEYPAIR)
# Env:
#   FACTORY=derelict-factory.testnet (optional)
#   CAPTAIN, VISITOR, BUYER, SUPPLIER (optional)
#   STATION (default latest timestamped name, e.g. isa02)
set -euo pipefail
cd "$(dirname "$0")/.."

FACTORY=${FACTORY:-derelict-factory.testnet}
CAPTAIN=${CAPTAIN:-captain.$FACTORY}
VISITOR=${VISITOR:-visitor.$FACTORY}
SUPPLIER=${SUPPLIER:-supplier.$FACTORY}
STATION=${STATION:-isa02}
cap_key() { grep -o 'SECRET KEYPAIR: ed25519:[A-Za-z0-9]*' "neardev/$1.key.txt" | awk '{print $3}' | sed 's/^ed25519://'; }
cap () { near contract call-function as-transaction "$@" | grep -iE "Transaction ID|error |Smart contract" | head -3; }

bash scripts/build.sh

echo "== Deploy factory wasm (no init) =="
near contract deploy "$FACTORY" use-file target/wasm/derelict_factory.wasm without-init-call \
  network-config testnet sign-with-plaintext-private-key "$(cap "$FACTORY")" send | grep -iE "Transaction ID"

echo "== Init factory with the station wasm embedded =="
python3 - <<-EOF
import json
args = {"wasm_code": list(open('target/wasm/derelict_station.wasm','rb').read())}
open('/tmp/opencode/derelict-new-args.json','w').write(json.dumps(args))
EOF
cp /tmp/opencode/derelict-new-args.json /tmp/opencode/new-args.json
cap "$FACTORY" new file-args /tmp/opencode/new-args.json prepaid-gas "300 Tgas" \
  attached-deposit "0 NEAR" sign-as "$FACTORY" network-config testnet \
  sign-with-plaintext-private-key "$(cap "$FACTORY")" send

echo "== Create station $STATION.$FACTORY (captain signs; attach storage + operating 6.021 N) =="
cap "$FACTORY" create_station \
  json-args "{\"name\": \"$STATION\", \"captain\": \"$CAPTAIN\", \"scenario\": \"standard-salvage\"}" \
  prepaid-gas "300 Tgas" attached-deposit "6.021 NEAR" sign-as "$CAPTAIN" \
  network-config testnet sign-with-plaintext-private-key "$(cap "$CAPTAIN")" send

echo "== Seed 6 standard + 6 heavy offers from the visitor =="
for i in 1 2 3 4 5 6; do
  cap "$STATION.$FACTORY" fund_offer json-args '{"kind": "standard"}' prepaid-gas "60 Tgas" \
    attached-deposit "0.005 NEAR" sign-as "$VISITOR" network-config testnet \
    sign-with-plaintext-private-key "$(cap "$VISITOR")" send
  cap "$STATION.$FACTORY" fund_offer json-args '{"kind": "heavy"}' prepaid-gas "60 Tgas" \
    attached-deposit "0.008 NEAR" sign-as "$VISITOR" network-config testnet \
    sign-with-plaintext-private-key "$(cap "$VISITOR")" send
done

echo "== Verify: station state + zero access keys =="
near contract call-function as-read-only "$STATION.$FACTORY" get_state json-args '{}' \
  network-config testnet now | tail -30
curl -s -X POST https://rpc.testnet.near.org -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":\"x\",\"method\":\"query\",\"params\":{\"request_type\":\"view_access_key_list\",\"finality\":\"final\",\"account_id\":\"$STATION.$FACTORY\"}}" \
  | grep '"keys"' || true

echo "OK: $STATION.$FACTORY ready. Judge walkthrough: docs/judging.md"
