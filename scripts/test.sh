#!/usr/bin/env bash
# Run contract unit tests + game-model fixtures.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "== Game model (TypeScript reference) =="
pnpm --filter @derelict/game-model test

echo "== Station contract unit tests =="
cargo test -p derelict-station

echo "All checks passed."
