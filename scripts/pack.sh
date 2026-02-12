#!/usr/bin/env bash
# pack.sh — Build and package PPTAgent for container deployment.
#
# Usage: bash scripts/pack.sh [output-path]
#
# Produces a tarball containing only what the container needs:
#   bin/                  bundled CLI scripts (self-contained JS)
#   package.json          dependency manifest (playwright, pptxgenjs)
#   package-lock.json     lockfile for reproducible installs
#   SKILL.md              model context document (router)
#   creating.md           phase 1: HTML generation guide
#   fixing.md             phase 2: defect fixing guide
#   scripts/container-setup.sh
#
# The bin/ scripts are esbuild bundles — all library code from dist/ is inlined,
# so dist/ is NOT shipped. Agents only see the CLI entry points.
#
# Default output: pptagent.tar.gz in the repo root.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${1:-$ROOT/pptagent.tar.gz}"

cd "$ROOT"

echo "=== PPTAgent Pack ==="

# 1. Clean previous build
echo "[1/4] Cleaning previous build..."
rm -rf dist/ bin/

# 2. Build TypeScript (needed for esbuild to resolve imports)
echo "[2/4] Building TypeScript..."
npx tsc
echo "  dist/ ready ($(find dist -name '*.js' | wc -l) files)"

# 3. Bundle CLI scripts into standalone JS files
echo "[3/4] Bundling CLI scripts..."
mkdir -p bin
npx esbuild \
  scripts/check-slide.ts \
  scripts/flatten.ts \
  scripts/to-pptx.ts \
  scripts/verify-setup.ts \
  scripts/replay.ts \
  --bundle --platform=node --format=esm --outdir=bin \
  --external:playwright --external:pptxgenjs
echo "  bin/ ready ($(ls bin/*.js | wc -l) files)"

# 4. Create tarball (bin/ only — no dist/, no scripts/*.ts)
echo "[4/4] Packing tarball..."
tar czf "$OUTPUT" \
  bin/ \
  package.json \
  package-lock.json \
  SKILL.md \
  creating.md \
  fixing.md \
  scripts/container-setup.sh

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo ""
echo "=== Done: $OUTPUT ($SIZE) ==="
