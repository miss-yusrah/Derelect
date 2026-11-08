#!/usr/bin/env bash
# Deploy factory + a fresh station to NEAR testnet.
# Prerequisites:
#   1. cargo install near-cli-rs   (provides `near`)
#   2. near account import use-config ... or NEAR_NETWORK_CONFIG env
# Set: FACTORY_ACCOUNT=... OWNER_ACCOUNT=... SHIP_ACCOUNT=... SUPPLIER_ACCOUNT=...
set -euo pipefail
cd "$(dirname "$0")/.."

for v in FACTORY_ACCOUNT OWNER_ACCOUNT; do
  [[ -n "${!v:-}" ]] || { echo "Missing env $v"; exit 1; }
done

bash scripts/build.sh

echo "== Deploying factory to ${FACTORY_ACCOUNT} =="
near contract deploy "${FACTORY_ACCOUNT}" wasm-file target/wasm/derelict_factory.wasm \
  network-config testnet sign-with-access-key-file ./neardev/"${FACTORY_ACCOUNT}".json send

echo "== Init factory (station wasm stored on-chain) =="
WASM_BASE64=$(base64 -w0 target/wasm/derelict_station.wasm)
near call "${FACTORY_ACCOUNT}" new "{\"wasm_code\": [$WASM_BASE64]}" \
  --accountId "${FACTORY_ACCOUNT}"

echo "Factory live. Next: scripts/fresh-run-station.sh <name>"
