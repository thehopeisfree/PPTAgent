/**
 * Demo: Image aspect ratio enforcement during patch application.
 *
 * Shows how the patch system auto-adjusts image dimensions to preserve
 * the original aspect ratio when the LLM changes w or h independently.
 *
 * Usage: npx tsx demo-ratio.ts
 *
 * Creates demo-ratio-output/ with iteration files, debug overlays,
 * and an interactive debug.html viewer showing ratio correction.
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
import { injectDebugOverlay } from "./src/debug/overlay.js";
import { computeFingerprint } from "./src/driver/loop-driver.js";

// ── Slide with a 16:9 image that extends out of bounds on the right ──
//
//  ┌──────────────────────────────────────────────┐
//  │  PRODUCT SHOWCASE                             │
//  │                                               │
//  │  ┌──────────────────────────────────┐         │
//  │  │      hero image (800×450)        │─── OOB ─┤
//  │  │         16:9 ratio               │         │
//  │  └──────────────────────────────────┘         │
//  │                                               │
//  │  Caption text                                 │
//  └──────────────────────────────────────────────┘
//
//  Problem: image x=560 + w=800 = 1360 > 1280 → out of bounds right

const slide = parseIR({
  slide: { w: 1280, h: 720 },
  elements: [
    {
      eid: "e_bg",
      type: "decoration",
      priority: 10,
      content: "",
      layout: { x: 0, y: 0, w: 1280, h: 720, zIndex: 0 },
      style: { backgroundColor: "#1a1a2e" },
    },
    {
      eid: "e_title",
      type: "title",
      priority: 100,
      content: "Product Showcase",
      layout: { x: 48, y: 32, w: 600, h: 72, zIndex: 10 },
      style: { fontSize: 44, lineHeight: 1.2, fontWeight: "bold", color: "#ffffff" },
    },
    {
      eid: "e_hero",
      type: "image",
      priority: 60,
      content: "https://via.placeholder.com/800x450/16213e/e2e8f0?text=16:9+Hero+Image",
      // OOB: x=560 + w=800 = 1360 > 1280
      layout: { x: 560, y: 140, w: 800, h: 450, zIndex: 10 },
      style: { borderRadius: 12 },
    },
    {
      eid: "e_caption",
      type: "text",
      priority: 50,
      content: "Next-generation interface — launching Q1 2026",
      layout: { x: 48, y: 620, w: 500, h: 40, zIndex: 10 },
      style: { fontSize: 16, lineHeight: 1.4, color: "#a0a0c0" },
    },
  ],
});

// ── Patch 1: LLM tries to fix OOB by shrinking w only ──
// w: 800→680, but h stays at 450 → distortion!
// System should auto-adjust h to 680/(800/450) = 383
const patch1 = parsePatch({
  edits: [{ eid: "e_hero", layout: { w: 680 } }],
});

// ── Patch 2: LLM tries to set both w and h to a square (distorted) ──
// w: 800→600, h: 450→600 → ratio 1:1 vs original 16:9 → system corrects h
const patch2 = parsePatch({
  edits: [{ eid: "e_hero", layout: { w: 600, h: 600 } }],
});

function printOverrides(label: string, overrides: { eid: string; field: string; requested: number; clamped_to: number; reason: string }[]) {
  if (overrides.length === 0) {
    console.log(`  No overrides.`);
    return;
  }
  console.log(`  OVERRIDES (${overrides.length}):`);
  for (const o of overrides) {
    console.log(`    ${o.eid}.${o.field}: requested ${o.requested} -> clamped to ${o.clamped_to}`);
    console.log(`      reason: ${o.reason}`);
  }
}

async function main() {
  const outDir = path.resolve("demo-ratio-output");
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  // ── Iteration 0: initial broken layout ──
  console.log("\n--- ITERATION 0: Initial layout (OOB image) ---\n");

  const html0 = renderHTML(slide);
  await fs.writeFile(path.join(outDir, "ir_0.json"), JSON.stringify(slide, null, 2));
  await fs.writeFile(path.join(outDir, "out_0.html"), html0);

  const dom0 = await extractDOM(page, html0);
  await fs.writeFile(path.join(outDir, "dom_0.json"), JSON.stringify(dom0, null, 2));

  const png0 = await screenshotSlide(page);
  await fs.writeFile(path.join(outDir, "render_0.png"), png0);

  const diag0 = diagnose(dom0, slide);
  await fs.writeFile(path.join(outDir, "diag_0.json"), JSON.stringify(diag0, null, 2));

  console.log(`  Defects: ${diag0.summary.defect_count}, Severity: ${diag0.summary.total_severity}`);
  for (const d of diag0.defects) {
    console.log(`    [${d.type}] ${d.eid ?? d.owner_eid}  severity=${d.severity}`);
  }

  // Debug overlay screenshot
  await page.setContent(html0, { waitUntil: "load" });
  await injectDebugOverlay(page, dom0, { diag: diag0 });
  const debugPng0 = await screenshotSlide(page);
  await fs.writeFile(path.join(outDir, "debug_0.png"), debugPng0);

  // ── Patch 1: LLM shrinks w only → ratio enforcement kicks in ──
  console.log("\n--- PATCH 1: Shrink w only (800 -> 680) ---\n");
  console.log("  Expected: h auto-adjusted from 450 to ~383 to preserve 16:9 ratio\n");

  const { ir: ir1, overrides: ov1 } = applyPatch(slide, patch1);
  await fs.writeFile(path.join(outDir, "patch_1.json"), JSON.stringify(patch1, null, 2));
  await fs.writeFile(path.join(outDir, "ir_1.json"), JSON.stringify(ir1, null, 2));

  const hero1 = ir1.elements.find((e) => e.eid === "e_hero")!;
  console.log(`  Result: w=${hero1.layout.w}, h=${hero1.layout.h}`);
  console.log(`  Ratio: ${(hero1.layout.w / hero1.layout.h).toFixed(4)} (original: ${(800 / 450).toFixed(4)})`);
  printOverrides("Patch 1", ov1);

  const html1 = renderHTML(ir1);
  await fs.writeFile(path.join(outDir, "out_1.html"), html1);

  const dom1 = await extractDOM(page, html1);
  const png1 = await screenshotSlide(page);
  await fs.writeFile(path.join(outDir, "render_1.png"), png1);

  const diag1 = diagnose(dom1, ir1);
  await fs.writeFile(path.join(outDir, "diag_1.json"), JSON.stringify(diag1, null, 2));
  console.log(`\n  After patch 1 — Defects: ${diag1.summary.defect_count}, Severity: ${diag1.summary.total_severity}`);

  // Debug overlay screenshot
  await page.setContent(html1, { waitUntil: "load" });
  await injectDebugOverlay(page, dom1, { diag: diag1 });
  const debugPng1 = await screenshotSlide(page);
  await fs.writeFile(path.join(outDir, "debug_1.png"), debugPng1);

  // ── Patch 2: LLM tries distorted square → ratio enforcement corrects ──
  console.log("\n--- PATCH 2: Set both w=600, h=600 (distorted square) ---\n");
  console.log("  Expected: h corrected from 600 to ~338 to preserve 16:9 ratio\n");

  const { ir: ir2, overrides: ov2 } = applyPatch(slide, patch2);
  await fs.writeFile(path.join(outDir, "patch_2.json"), JSON.stringify(patch2, null, 2));
  await fs.writeFile(path.join(outDir, "ir_2.json"), JSON.stringify(ir2, null, 2));

  const hero2 = ir2.elements.find((e) => e.eid === "e_hero")!;
  console.log(`  Result: w=${hero2.layout.w}, h=${hero2.layout.h}`);
  console.log(`  Ratio: ${(hero2.layout.w / hero2.layout.h).toFixed(4)} (original: ${(800 / 450).toFixed(4)})`);
  printOverrides("Patch 2", ov2);

  const html2 = renderHTML(ir2);
  await fs.writeFile(path.join(outDir, "out_2.html"), html2);

  const dom2 = await extractDOM(page, html2);
  const png2 = await screenshotSlide(page);
  await fs.writeFile(path.join(outDir, "render_2.png"), png2);

  const diag2 = diagnose(dom2, ir2);
  await fs.writeFile(path.join(outDir, "diag_2.json"), JSON.stringify(diag2, null, 2));
  console.log(`\n  After patch 2 — Defects: ${diag2.summary.defect_count}, Severity: ${diag2.summary.total_severity}`);

  // Debug overlay screenshot
  await page.setContent(html2, { waitUntil: "load" });
  await injectDebugOverlay(page, dom2, { diag: diag2 });
  const debugPng2 = await screenshotSlide(page);
  await fs.writeFile(path.join(outDir, "debug_2.png"), debugPng2);

  await browser.close();

  // ── Generate interactive debug HTML ──
  const fp1 = computeFingerprint(slide, patch1);
  const fp2 = computeFingerprint(slide, patch2);
  const snapshots: DebugSnapshot[] = [
    { iter: 0, ir: slide, dom: dom0, diag: diag0, tabooFingerprints: [] },
    { iter: 1, ir: ir1, dom: dom1, diag: diag1, overrides: ov1, patch: patch1, fingerprint: fp1, tabooFingerprints: [] },
    { iter: 2, ir: ir2, dom: dom2, diag: diag2, overrides: ov2, patch: patch2, fingerprint: fp2, tabooFingerprints: [] },
  ];
  const debugHTML = generateDebugHTML(snapshots);
  await fs.writeFile(path.join(outDir, "debug.html"), debugHTML);

  // ── Summary ──
  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY: Image Aspect Ratio Enforcement");
  console.log("=".repeat(60));
  console.log(`  Original image: 800x450 (ratio ${(800 / 450).toFixed(4)})`);
  console.log(`  Patch 1 (w only):  w=680 -> h auto-adjusted to ${hero1.layout.h} (ratio ${(hero1.layout.w / hero1.layout.h).toFixed(4)})`);
  console.log(`  Patch 2 (both distorted): w=600,h=600 -> h corrected to ${hero2.layout.h} (ratio ${(hero2.layout.w / hero2.layout.h).toFixed(4)})`);
  console.log(`\nAll files in: ${outDir}/`);
  console.log(`  iter 0: ir_0.json  out_0.html  render_0.png  debug_0.png  dom_0.json  diag_0.json`);
  console.log(`  iter 1: patch_1.json  ir_1.json  out_1.html  render_1.png  debug_1.png  dom_1.json  diag_1.json`);
  console.log(`  iter 2: patch_2.json  ir_2.json  out_2.html  render_2.png  debug_2.png  dom_2.json  diag_2.json`);
  console.log(`  debug:  debug.html (interactive viewer)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
