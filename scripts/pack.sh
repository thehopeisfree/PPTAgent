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

# 4. Stage files for tarball (stripped package.json — no main/exports)
echo "[4/5] Staging tarball contents..."
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp -r bin/ "$STAGE/bin/"
cp package-lock.json SKILL.md creating.md fixing.md "$STAGE/"
mkdir -p "$STAGE/scripts"
cp scripts/container-setup.sh "$STAGE/scripts/"

# Generate stripped package.json: no main/types/exports/devDependencies/scripts
# so agents see no importable entry points — CLI only
node --input-type=commonjs -e "
  const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
  const slim = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    type: pkg.type,
    dependencies: pkg.dependencies,
  };
  require('fs').writeFileSync('package.container.json', JSON.stringify(slim, null, 2) + '\n');
"
cp package.container.json "$STAGE/package.json"
rm -f package.container.json
echo "  Staged (package.json stripped of main/exports/devDependencies)"

# 5. Create tarball from staging directory
echo "[5/5] Packing tarball..."
tar czf "$OUTPUT" -C "$STAGE" .

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo ""
echo "=== Done: $OUTPUT ($SIZE) ==="
