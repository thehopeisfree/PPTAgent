/**
 * Demo: clamp_reason on Override — shows all 4 clamp reasons in one patch.
 *
 * Usage: npx tsx demo-clamp-reason.ts
 *
 * Creates demo-clamp-reason-output/ with an interactive debug.html
 * that shows each override tagged with its clamp_reason:
 *   - "budget"   (high-priority title moved too far)
 *   - "ratio"    (image aspect ratio preserved)
 *   - "min_font" (font size raised to priority-tier minimum)
 *   - "bounds"   (element clamped to slide edges)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { chromium } from "playwright";
import { parseIR } from "./src/schema/ir.js";
import { parsePatch } from "./src/schema/patch.js";
import { renderHTML } from "./src/renderer/html-renderer.js";
import { extractDOM, screenshotSlide } from "./src/extraction/dom-extractor.js";
import { diagnose } from "./src/diagnostics/engine.js";
import { applyPatch } from "./src/patch/apply-patch.js";
import { generateDebugHTML } from "./src/debug/visual-debug.js";
import type { DebugSnapshot } from "./src/debug/visual-debug.js";
import { computeFingerprint } from "./src/driver/loop-driver.js";

// ── Slide designed to trigger all 4 clamp reasons in one patch ──
//
//  e_title:  priority 100  → budget clamp when moved >48px
//  e_photo:  image 4:3     → ratio clamp when only w is changed
//  e_note:   priority 80   → min_font clamp when fontSize set below 20
//  e_badge:  priority 40   → bounds clamp when pushed past slide edge
const slide = parseIR({
  slide: { w: 1280, h: 720 },
  elements: [
    {
      eid: "e_bg",
      type: "decoration",
      priority: 10,
      content: "",
      layout: { x: 0, y: 0, w: 1280, h: 720, zIndex: 0 },
      style: { backgroundColor: "#0f172a" },
    },
    {
      eid: "e_title",
      type: "title",
      priority: 100,
      content: "Override Clamp Reasons",
      layout: { x: 48, y: 32, w: 700, h: 72, zIndex: 10 },
      style: { fontSize: 44, lineHeight: 1.2, fontWeight: "bold", color: "#e2e8f0" },
    },
    {
      eid: "e_photo",
      type: "image",
      priority: 50,
      content: "https://via.placeholder.com/400x300/334155/94a3b8?text=4:3+Photo",
      layout: { x: 48, y: 140, w: 400, h: 300, zIndex: 10 },
      style: { borderRadius: 8 },
    },
    {
      eid: "e_note",
      type: "bullets",
      priority: 80,
      content: "• Budget clamp limits high-priority moves to 48px\n• Ratio clamp preserves image aspect ratios\n• Min-font clamp enforces priority-tier minimums\n• Bounds clamp keeps elements inside 1280x720",
      layout: { x: 500, y: 140, w: 500, h: 200, zIndex: 10 },
      style: { fontSize: 22, lineHeight: 1.5, color: "#cbd5e1" },
    },
    {
      eid: "e_badge",
      type: "text",
      priority: 40,
      content: "Slide edge test element",
      layout: { x: 900, y: 600, w: 300, h: 60, zIndex: 10 },
      style: { fontSize: 18, lineHeight: 1.3, color: "#64748b" },
    },
  ],
});

// ── One patch that triggers all 4 clamp reasons ──
// 1. budget:   move e_title y from 32 to 200 (delta 168 > 48px limit)
// 2. ratio:    set e_photo w to 240 without touching h → h auto-adjusts
// 3. min_font: set e_note fontSize to 12 (below 20 min for priority 80)
// 4. bounds:   move e_badge x to 1100, w stays 300 → x+w=1400 > 1280
const patch = parsePatch({
  edits: [
    { eid: "e_title", layout: { y: 200 } },
    { eid: "e_photo", layout: { w: 240 } },
    { eid: "e_note", style: { fontSize: 12 } },
    { eid: "e_badge", layout: { x: 1100 } },
  ],
});

async function main() {
  const outDir = path.resolve("demo-clamp-reason-output");
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  // ── Iteration 0: original layout ──
  console.log("\n--- ITERATION 0: Original layout ---\n");
  const html0 = renderHTML(slide);
  const dom0 = await extractDOM(page, html0);
  const diag0 = diagnose(dom0, slide);
  await screenshotSlide(page);

  console.log(`  Defects: ${diag0.summary.defect_count}`);

  // ── Apply the patch ──
  console.log("\n--- PATCH: triggers all 4 clamp reasons ---\n");
  const { ir: ir1, overrides: ov1 } = applyPatch(slide, patch);

  // Group overrides by clamp_reason
  const byReason = new Map<string, typeof ov1>();
  for (const o of ov1) {
    const list = byReason.get(o.clamp_reason) ?? [];
    list.push(o);
    byReason.set(o.clamp_reason, list);
  }

  console.log(`  Total overrides: ${ov1.length}\n`);
  for (const [reason, overrides] of byReason) {
    console.log(`  [${reason}] (${overrides.length} overrides)`);
    for (const o of overrides) {
      console.log(`    ${o.eid}.${o.field}: ${o.requested} -> ${o.clamped_to}`);
      console.log(`      ${o.reason}`);
    }
    console.log();
  }

  // ── Render patched layout ──
  const html1 = renderHTML(ir1);
  const dom1 = await extractDOM(page, html1);
  const diag1 = diagnose(dom1, ir1);
  await screenshotSlide(page);

  console.log(`  After patch — Defects: ${diag1.summary.defect_count}, Severity: ${diag1.summary.total_severity}`);

  await browser.close();

  // ── Generate interactive debug HTML ──
  const fp = computeFingerprint(slide, patch);
  const snapshots: DebugSnapshot[] = [
    { iter: 0, ir: slide, dom: dom0, diag: diag0 },
    { iter: 1, ir: ir1, dom: dom1, diag: diag1, overrides: ov1, patch, fingerprint: fp, tabooFingerprints: [] },
  ];
  const debugHTML = generateDebugHTML(snapshots);
  await fs.writeFile(path.join(outDir, "debug.html"), debugHTML);

  // Write overrides as standalone JSON for inspection
  await fs.writeFile(path.join(outDir, "overrides.json"), JSON.stringify(ov1, null, 2));

  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY: clamp_reason on Override");
  console.log("=".repeat(60));
  console.log(`  budget:   ${byReason.get("budget")?.length ?? 0} overrides (title y clamped to 48px budget)`);
  console.log(`  ratio:    ${byReason.get("ratio")?.length ?? 0} overrides (photo h auto-adjusted for 4:3)`);
  console.log(`  min_font: ${byReason.get("min_font")?.length ?? 0} overrides (note fontSize raised to 20)`);
  console.log(`  bounds:   ${byReason.get("bounds")?.length ?? 0} overrides (badge w clamped to slide edge)`);
  console.log(`\nOpen: ${path.join(outDir, "debug.html")}`);
  console.log(`  → Click "Overrides" tab in the right panel to see clamp_reason on each`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
