#!/usr/bin/env bash
# Build both station and factory contracts (release wasm).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Building station contract (release) =="
cargo build -p derelict-station --release --target wasm32-unknown-unknown
echo "== Building factory contract (release) =="
cargo build -p derelict-factory --release --target wasm32-unknown-unknown

mkdir -p target/wasm
cp target/wasm32-unknown-unknown/release/derelict_station.wasm target/wasm/
cp target/wasm32-unknown-unknown/release/derelict_factory.wasm target/wasm/

echo "== Wasm sizes =="
ls -la target/wasm/
echo "OK"
