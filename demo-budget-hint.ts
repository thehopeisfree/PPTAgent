/**
 * Demo: limited_by_budget on Hint — shows hints annotated with
 * budget constraints for high-priority elements.
 *
 * Usage: npx tsx demo-budget-hint.ts
 *
 * Creates demo-budget-hint-output/ with an interactive debug.html showing:
 *   - A high-priority element whose hint suggests a >48px move
 *     → hint.limited_by_budget = true, steps_needed > 1
 *   - A low-priority element whose hint is NOT budget-limited
 *   - Multi-step convergence: patch 1 moves 48px, patch 2 moves the rest
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

// ── Slide where a high-priority element overlaps another,
//    and the hint to fix it requires >48px move ──
//
//  e_title (priority 100) at y=40
//  e_body  (priority 80)  at y=90  ← overlaps title, needs to move down ~60px
//                                     but budget limits to 48px per step
//  e_aside (priority 40)  at y=500 ← overlaps nothing, not budget-limited

const slide = parseIR({
  slide: { w: 1280, h: 720 },
  elements: [
    {
      eid: "e_bg",
      type: "decoration",
      priority: 10,
      content: "",
      layout: { x: 0, y: 0, w: 1280, h: 720, zIndex: 0 },
      style: { backgroundColor: "#0c0a09" },
    },
    {
      eid: "e_title",
      type: "title",
      priority: 100,
      content: "Budget-Limited Hints Demo",
      layout: { x: 48, y: 40, w: 700, h: 120, zIndex: 10 },
      style: { fontSize: 44, lineHeight: 1.2, fontWeight: "bold", color: "#fafaf9" },
    },
    {
      eid: "e_body",
      type: "bullets",
      priority: 80,
      content: "• This body element overlaps the title above\n• Hint suggests moving it down, but budget limits each step to 48px\n• After 2 iterations the overlap is resolved\n• Check limited_by_budget and steps_needed in diag.json",
      // Deliberately overlapping title: title bottom at y=160, safeBox at 168,
      // body starts at y=60, safeBox at y=52 → massive overlap ~108px
      layout: { x: 48, y: 60, w: 700, h: 250, zIndex: 10 },
      style: { fontSize: 20, lineHeight: 1.6, color: "#d6d3d1" },
    },
    {
      eid: "e_aside",
      type: "text",
      priority: 40,
      content: "This aside is not budget-limited (priority 40 < 80 threshold)",
      layout: { x: 48, y: 600, w: 600, h: 50, zIndex: 10 },
      style: { fontSize: 18, lineHeight: 1.4, color: "#78716c" },
    },
  ],
});

async function main() {
  const outDir = path.resolve("demo-budget-hint-output");
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  // ── Iteration 0: diagnose the overlap ──
  console.log("\n--- ITERATION 0: Initial layout (title/body overlap) ---\n");
  const html0 = renderHTML(slide);
  const dom0 = await extractDOM(page, html0);
  const diag0 = diagnose(dom0, slide);

  console.log(`  Defects: ${diag0.summary.defect_count}, Severity: ${diag0.summary.total_severity}\n`);

  // Show hints with budget annotations
  console.log("  Hints with budget annotations:");
  for (const d of diag0.defects) {
    if (!d.hint) continue;
    const eid = d.hint.target_eid ?? d.eid ?? d.owner_eid ?? "?";
    const budgetInfo = d.hint.limited_by_budget
      ? `  ** LIMITED_BY_BUDGET: max_delta=${d.hint.budget_max_delta}, steps_needed=${d.hint.steps_needed}`
      : "  (within budget)";
    console.log(`    [${d.type}] target=${eid}`);
    console.log(`      action: ${d.hint.action}`);
    if (d.hint.suggested_y != null) console.log(`      suggested_y: ${d.hint.suggested_y}`);
    if (d.hint.suggested_h != null) console.log(`      suggested_h: ${d.hint.suggested_h}`);
    console.log(`     ${budgetInfo}`);
    console.log();
  }

  // ── Patch 1: LLM follows the hint but gets clamped ──
  // The hint might suggest e_body move to y≈156, but budget allows only 90+48=138
  console.log("--- PATCH 1: Move e_body down (will be budget-clamped) ---\n");
  const patch1 = parsePatch({
    edits: [{ eid: "e_body", layout: { y: 160 } }],
  });
  const { ir: ir1, overrides: ov1 } = applyPatch(slide, patch1);
  const body1 = ir1.elements.find((e) => e.eid === "e_body")!;
  console.log(`  Requested y=160, got y=${body1.layout.y} (clamped by budget)`);
  for (const o of ov1) {
    console.log(`  Override: ${o.eid}.${o.field} ${o.requested} -> ${o.clamped_to} [${o.clamp_reason}]`);
  }

  const html1 = renderHTML(ir1);
  const dom1 = await extractDOM(page, html1);
  const diag1 = diagnose(dom1, ir1);
  console.log(`\n  After patch 1 — Defects: ${diag1.summary.defect_count}, Severity: ${diag1.summary.total_severity}`);

  // Show if hints are still budget-limited
  for (const d of diag1.defects) {
    if (d.hint?.limited_by_budget) {
      console.log(`  Still limited: ${d.hint.target_eid ?? d.eid}, steps_needed=${d.hint.steps_needed}`);
    }
  }

  // ── Patch 2: second step finishes the move ──
  console.log("\n--- PATCH 2: Move e_body down again (should resolve) ---\n");
  const patch2 = parsePatch({
    edits: [{ eid: "e_body", layout: { y: 180 } }],
  });
  const { ir: ir2, overrides: ov2 } = applyPatch(ir1, patch2);
  const body2 = ir2.elements.find((e) => e.eid === "e_body")!;
  console.log(`  Requested y=180, got y=${body2.layout.y}`);
  for (const o of ov2) {
    console.log(`  Override: ${o.eid}.${o.field} ${o.requested} -> ${o.clamped_to} [${o.clamp_reason}]`);
  }
  if (ov2.length === 0) console.log("  No overrides (within 48px budget this time)");

  const html2 = renderHTML(ir2);
  const dom2 = await extractDOM(page, html2);
  const diag2 = diagnose(dom2, ir2);
  console.log(`\n  After patch 2 — Defects: ${diag2.summary.defect_count}, Severity: ${diag2.summary.total_severity}`);

  await browser.close();

  // ── Generate interactive debug HTML ──
  const fp1 = computeFingerprint(slide, patch1);
  const fp2 = computeFingerprint(ir1, patch2);
  const snapshots: DebugSnapshot[] = [
    { iter: 0, ir: slide, dom: dom0, diag: diag0 },
    { iter: 1, ir: ir1, dom: dom1, diag: diag1, overrides: ov1, patch: patch1, fingerprint: fp1, tabooFingerprints: [] },
    { iter: 2, ir: ir2, dom: dom2, diag: diag2, overrides: ov2, patch: patch2, fingerprint: fp2, tabooFingerprints: [] },
  ];
  const debugHTML = generateDebugHTML(snapshots);
  await fs.writeFile(path.join(outDir, "debug.html"), debugHTML);
  await fs.writeFile(path.join(outDir, "diag_0.json"), JSON.stringify(diag0, null, 2));
  await fs.writeFile(path.join(outDir, "diag_1.json"), JSON.stringify(diag1, null, 2));
  await fs.writeFile(path.join(outDir, "diag_2.json"), JSON.stringify(diag2, null, 2));

  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY: limited_by_budget on Hint");
  console.log("=".repeat(60));
  const body0y = slide.elements.find((e) => e.eid === "e_body")!.layout.y;
  console.log("  Iter 0: hint says move e_body down, but limited_by_budget=true");
  console.log(`  Iter 1: e_body y: ${body0y} → ${body1.layout.y} (clamped by 48px budget)`);
  console.log(`  Iter 2: e_body y: ${body1.layout.y} → ${body2.layout.y} (second step, converging)`);
  console.log(`\nOpen: ${path.join(outDir, "debug.html")}`);
  console.log("  → Diagnostics panel shows limited_by_budget, budget_max_delta, steps_needed");
  console.log("  → Overrides panel shows clamp_reason: 'budget' on iter 1");
  console.log("  → Play through iterations to see convergence over 2 steps");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
