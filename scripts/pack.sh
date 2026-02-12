#!/usr/bin/env bash
# pack.sh — Build and package PPTAgent for container deployment.
#
# Usage: bash scripts/pack.sh [output-path]
#
# Produces a tarball containing only what the container needs:
#   dist/                 compiled JS + declarations
#   package.json          dependency manifest
#   package-lock.json     lockfile for reproducible installs
#   SKILL.md              model context document (router)
#   creating.md           phase 1: HTML generation guide
#   fixing.md             phase 2: defect fixing guide
#   scripts/container-setup.sh
#
# Default output: pptagent.tar.gz in the repo root.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${1:-$ROOT/pptagent.tar.gz}"

cd "$ROOT"

echo "=== PPTAgent Pack ==="

# 1. Clean previous build
echo "[1/3] Cleaning previous build..."
rm -rf dist/

# 2. Build TypeScript
echo "[2/3] Building TypeScript..."
npx tsc
echo "  dist/ ready ($(find dist -name '*.js' | wc -l) files)"

# 3. Create tarball
echo "[3/3] Packing tarball..."
tar czf "$OUTPUT" \
  dist/ \
  package.json \
  package-lock.json \
  SKILL.md \
  creating.md \
  fixing.md \
  scripts/container-setup.sh

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo ""
echo "=== Done: $OUTPUT ($SIZE) ==="
