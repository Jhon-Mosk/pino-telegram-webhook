#!/usr/bin/env bash
# Packs the package and checks the tarball the way users install it:
# ESM import, CJS require, loading by name as a pino target and the
# TypeScript definitions. Catches mistakes in "exports", "files" and index.d.ts.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cd "$root"
tarball="$work/$(npm pack --silent --pack-destination "$work" | tail -n 1)"
echo "packed: $(basename "$tarball")"
tar -tzf "$tarball" | sort

cp "$root"/scripts/package-check/* "$work/"
cd "$work"
npm init -y >/dev/null
npm install --no-audit --no-fund --silent \
  "$tarball" pino@9 typescript@7 @types/node

node esm.mjs
node cjs.cjs
node pino-target.mjs
npx tsc -p tsconfig.json
echo 'types: ok'
