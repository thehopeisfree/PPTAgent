#!/usr/bin/env bash
# container-setup.sh — PPTAgent container bootstrap for CaaS
#
# Works in two modes:
#   A) Tarball deployment (from blobstore) — dist/ already exists, no build needed
#   B) Full repo (dev)                     — builds from src/
#
# Usage:
#   # Tarball: download + extract, then run setup
#   tar xzf pptagent.tar.gz -C /tools/pptagent
#   bash /tools/pptagent/scripts/container-setup.sh
#
#   # Full repo: just run setup
#   bash scripts/container-setup.sh
#
# Environment variables (all optional):
#   PPTAGENT_ROOT    — repo location (default: parent of scripts/)
#   SHARED_DIR       — shared directory for skill docs (default: /shared)
#   SKIP_FONTS       — set to "1" to skip font installation
#   SKIP_VERIFY      — set to "1" to skip smoke test

set -euo pipefail

PPTAGENT_ROOT="${PPTAGENT_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SHARED_DIR="${SHARED_DIR:-/shared}"
SKIP_FONTS="${SKIP_FONTS:-0}"
SKIP_VERIFY="${SKIP_VERIFY:-0}"

cd "$PPTAGENT_ROOT"

# Detect mode: tarball (dist/ exists, no src/) vs full repo (src/ exists)
if [ -d "dist" ] && [ ! -d "src" ]; then
  MODE="tarball"
else
  MODE="repo"
fi

echo "=== PPTAgent Container Setup (mode: $MODE) ==="
echo "Root:   $PPTAGENT_ROOT"
echo "Shared: $SHARED_DIR"
echo "Node:   $(node --version 2>/dev/null || echo 'not found')"
echo "npm:    $(npm --version 2>/dev/null || echo 'not found')"

# ── Step 1: Clean stale state ──
echo ""
echo "[1/6] Cleaning stale state..."
rm -rf rollouts/ /tmp/verify-test 2>/dev/null || true
if [ "$MODE" = "repo" ]; then
  rm -rf dist/ demo-*-output/ 2>/dev/null || true
fi
echo "  Done."

# ── Step 2: Install npm dependencies ──
echo ""
echo "[2/6] Installing npm dependencies..."
if [ "$MODE" = "tarball" ]; then
  npm ci --production --prefer-offline 2>/dev/null || npm install --production
else
  npm ci --prefer-offline 2>/dev/null || npm install
fi
echo "  Done."

# ── Step 3: Chromium setup ──
echo ""
echo "[3/6] Setting up Chromium..."
# Check for system Chromium first (CaaS containers typically have it)
SYSTEM_CHROMIUM=""
for candidate in /usr/bin/chromium /usr/bin/chromium-browser /usr/bin/google-chrome; do
  if [ -x "$candidate" ]; then
    SYSTEM_CHROMIUM="$candidate"
    break
  fi
done

if [ -n "$SYSTEM_CHROMIUM" ]; then
  echo "  Found system Chromium: $SYSTEM_CHROMIUM"
  echo "  Setting CHROMIUM_PATH for launchBrowser()"
  export CHROMIUM_PATH="$SYSTEM_CHROMIUM"
  # Persist for later processes
  echo "export CHROMIUM_PATH=\"$SYSTEM_CHROMIUM\"" >> /etc/profile.d/pptagent.sh 2>/dev/null || \
    echo "export CHROMIUM_PATH=\"$SYSTEM_CHROMIUM\"" >> "$HOME/.bashrc" 2>/dev/null || true
else
  echo "  No system Chromium found, installing via Playwright..."
  # --with-deps installs system libraries (libgbm, libnss3, etc.) needed in containers
  npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium
fi
echo "  Done."

# ── Step 4: Install fonts ──
if [ "$SKIP_FONTS" = "1" ]; then
  echo ""
  echo "[4/6] Skipping font installation (SKIP_FONTS=1)."
else
  echo ""
  echo "[4/6] Installing fonts..."
  if command -v apt-get &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq \
      fonts-noto fonts-noto-cjk fonts-liberation fonts-dejavu-core \
      2>/dev/null || echo "  Warning: some font packages unavailable"
    fc-cache -f 2>/dev/null || true
  elif command -v yum &>/dev/null; then
    yum install -y -q \
      google-noto-sans-fonts google-noto-sans-cjk-fonts liberation-fonts \
      2>/dev/null || echo "  Warning: some font packages unavailable"
    fc-cache -f 2>/dev/null || true
  else
    echo "  Warning: No supported package manager (apt/yum) — skipping system fonts"
  fi
  echo "  Done."
fi

# ── Step 5: Build TypeScript (repo mode only) ──
echo ""
if [ "$MODE" = "repo" ]; then
  echo "[5/6] Building TypeScript..."
  npm run build
else
  echo "[5/6] Skipping build (pre-built tarball)."
fi
echo "  Done."

# ── Step 6: Copy skill docs to shared directory ──
echo ""
echo "[6/6] Setting up skill docs..."
mkdir -p "$SHARED_DIR" 2>/dev/null || true
if [ -d "$SHARED_DIR" ]; then
  cp "$PPTAGENT_ROOT/SKILL.md" "$SHARED_DIR/pptagent-skill.md" 2>/dev/null || true
  echo "  Copied SKILL.md → $SHARED_DIR/pptagent-skill.md"
else
  echo "  Warning: $SHARED_DIR not accessible — skill docs not copied"
fi
echo "  Done."

# ── Verify ──
if [ "$SKIP_VERIFY" = "1" ]; then
  echo ""
  echo "Skipping verification (SKIP_VERIFY=1)."
else
  echo ""
  echo "Running smoke test..."
  node --input-type=module -e "
    import { parseIR, renderHTML, applyPatch, parsePatch } from '$PPTAGENT_ROOT/dist/index.js';
    const ir = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [{
        eid: 'e1', type: 'title', priority: 100,
        content: 'Test', layout: { x: 40, y: 40, w: 400, h: 60 },
        style: { fontSize: 36 },
      }],
    });
    const html = renderHTML(ir);
    if (!html.includes('data-eid')) throw new Error('renderHTML failed');
    const patch = parsePatch({ edits: [{ eid: 'e1', layout: { x: 50 } }] });
    const { ir: patched } = applyPatch(ir, patch);
    if (patched.elements[0].layout.x !== 50) throw new Error('applyPatch failed');
    console.log('  Schema, renderer, patch: OK');
  "
  echo "  Smoke test passed."
fi

echo ""
echo "=== PPTAgent ready ==="
echo ""
echo "Import from: $PPTAGENT_ROOT/dist/index.js"
