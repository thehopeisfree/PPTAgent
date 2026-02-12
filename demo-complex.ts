/**
 * Complex demo: a realistic "Team Overview" slide with 8 elements and
 * multiple interacting defects — overlap chains, cross-zIndex occlusion,
 * out-of-bounds, content overflow, and font violations.
 *
 * Usage: npx tsx demo-complex.ts
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

// ── Slide: "Team Overview" with 8 elements and cascading layout problems ──
//
//  Visual intent:
//    ┌─────────────────────────────────────────────────────┐
//    │ [accent bar]                                         │
//    │   TEAM PERFORMANCE Q3 2025                           │
//    │                                                      │
//    │   • metric 1        ┌──────────┐   ┌──────────┐     │
//    │   • metric 2        │  photo1  │   │  photo2  │     │
//    │   • metric 3        └──────────┘   └──────────┘     │
//    │   • metric 4                                         │
//    │   • metric 5        Key Insight callout box          │
//    │                                                      │
//    │   Source: ...                                         │
//    └─────────────────────────────────────────────────────┘
//
//  Problems baked in:
//    1. Title overlaps with bullets (y gap too small)
//    2. Bullets overflow their container (8 items in 180px)
//    3. Photo2 is out of bounds (right edge)
//    4. Callout box overlaps with photo1 (same zIndex)
//    5. Caption font 10px < 16px min
//    6. Accent bar (decoration) overlaps everything — but exempt
//    7. Callout is at zIndex 20, overlaps photo2 → occlusion_suspected warning

const slide = parseIR({
  slide: { w: 1280, h: 720 },
  elements: [
    // ── decoration: left accent bar (exempt from overlap) ──
    {
      eid: "e_accent",
      type: "decoration",
      priority: 10,
      content: "",
      layout: { x: 0, y: 0, w: 12, h: 720, zIndex: 0 },
      style: { backgroundColor: "#2563eb" },
    },
    // ── decoration: subtle background panel ──
    {
      eid: "e_panel",
      type: "decoration",
      priority: 10,
      content: "",
      layout: { x: 0, y: 0, w: 1280, h: 720, zIndex: 0 },
      style: { backgroundColor: "#fafafa" },
    },
    // ── title ──
    {
      eid: "e_title",
      type: "title",
      priority: 100,
      content: "Team Performance Q3 2025",
      layout: { x: 40, y: 28, w: 800, h: 72, zIndex: 10 },
      style: { fontSize: 42, lineHeight: 1.2, fontWeight: "bold", color: "#1e293b" },
    },
    // ── subtitle / tagline ──
    {
      eid: "e_subtitle",
      type: "text",
      priority: 70,
      content: "Engineering & Product Division — Confidential",
      // Problem: starts at y=80, title bottom is ~100 → tight, safeBoxes will collide
      layout: { x: 40, y: 80, w: 600, h: 36, zIndex: 10 },
      style: { fontSize: 18, lineHeight: 1.3, color: "#64748b" },
    },
    // ── key metrics bullets ──
    {
      eid: "e_metrics",
      type: "bullets",
      priority: 80,
      content:
        "• Sprint velocity increased 34% (82 → 110 pts/sprint)\n• Deployment frequency: 12/week → 23/week (+92%)\n• Mean time to recovery improved from 4.2h to 1.1h\n• Customer-reported P0 bugs down 67% quarter-over-quarter\n• Code review turnaround reduced from 18h to 6h median\n• Test coverage expanded from 72% to 89% across all repos\n• On-call pages reduced 41% after reliability initiatives\n• 3 major feature launches shipped ahead of schedule",
      // Problem: 8 long bullet items in only 180px height → content overflow
      layout: { x: 40, y: 140, w: 560, h: 180, zIndex: 10 },
      style: { fontSize: 15, lineHeight: 1.55, color: "#334155" },
    },
    // ── photo 1: team headshot ──
    {
      eid: "e_photo1",
      type: "image",
      priority: 40,
      content: "https://via.placeholder.com/280x200/e2e8f0/475569?text=Team+Alpha",
      layout: { x: 660, y: 160, w: 280, h: 200, zIndex: 10 },
      style: { borderRadius: 8 },
    },
    // ── photo 2: team headshot ──
    {
      eid: "e_photo2",
      type: "image",
      priority: 40,
      content: "https://via.placeholder.com/280x200/e2e8f0/475569?text=Team+Beta",
      // Problem: x=1020 + w=280 = 1300 > 1280 → out of bounds right
      layout: { x: 1020, y: 160, w: 280, h: 200, zIndex: 10 },
      style: { borderRadius: 8 },
    },
    // ── callout box: key insight ──
    {
      eid: "e_callout",
      type: "text",
      priority: 60,
      content:
        "Key Insight: Cross-team pairing sessions drove the largest single improvement in review turnaround. Teams that adopted the practice saw 3× faster PR merge times compared to control group.",
      // Problem 1: overlaps with e_photo1 at same zIndex (x=660..940, this starts at x=640)
      // Problem 2: at zIndex 20, overlaps with e_photo2 → occlusion_suspected
      layout: { x: 640, y: 400, w: 600, h: 120, zIndex: 20 },
      style: {
        fontSize: 15,
        lineHeight: 1.5,
        color: "#1e40af",
        backgroundColor: "#eff6ff",
        borderRadius: 8,
      },
    },
    // ── source caption ──
    {
      eid: "e_source",
      type: "text",
      priority: 60,
      content: "Source: Engineering Metrics Dashboard · Internal Use Only · Updated 2025-10-01",
      layout: { x: 40, y: 680, w: 700, h: 28, zIndex: 10 },
      // Problem: font 10px < 16px minimum for priority 60
      style: { fontSize: 10, lineHeight: 1.3, color: "#94a3b8" },
    },
  ],
});

// ── A patch that an LLM might produce after seeing the diagnostics ──
const fixPatch = parsePatch({
  edits: [
    // Fix subtitle position (move below title safeBox)
    { eid: "e_subtitle", layout: { y: 108 } },
    // Fix metrics: move down, increase height, bump font to minimum
    { eid: "e_metrics", layout: { y: 155, h: 360 }, style: { fontSize: 20 } },
    // Fix photo2: pull left within bounds
    { eid: "e_photo2", layout: { x: 980, w: 260 } },
    // Fix callout: move below photos to avoid overlap
    { eid: "e_callout", layout: { y: 420, w: 560 } },
    // Fix source caption font
    { eid: "e_source", style: { fontSize: 16 } },
  ],
});

// ── Pretty printer ──
function printDiag(label: string, diag: ReturnType<typeof diagnose>) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(label);
  console.log("=".repeat(70));
  console.log(`  Defects:  ${diag.summary.defect_count}`);
  console.log(`  Warnings: ${diag.summary.warning_count}`);
  console.log(`  Severity: ${diag.summary.total_severity}`);

  if (diag.defects.length > 0) {
    console.log("\n  DEFECTS:");
    for (const d of diag.defects) {
      const eid = d.eid ?? d.owner_eid ?? "?";
      const other = d.other_eid ? ` (vs ${d.other_eid})` : "";
      console.log(`    [${d.type}] ${eid}${other}  severity=${d.severity}`);
      console.log(`      ${JSON.stringify(d.details)}`);
      if (d.hint) {
        const { action, validated, reason, ...vals } = d.hint;
        const valStr = Object.keys(vals).length > 0 ? " " + JSON.stringify(vals) : "";
        console.log(`      → hint: ${action}${valStr}${validated ? " ✓" : ""}`);
      }
    }
  }

  if (diag.warnings.length > 0) {
    console.log("\n  WARNINGS:");
    for (const w of diag.warnings) {
      if (w.type === "occlusion_suspected") {
        console.log(`    [${w.type}] ${w.owner_eid} ↔ ${w.other_eid}  (top: ${w.details.top_eid}, area: ${w.details.overlap_area_px}px²)`);
      } else {
        console.log(`    [${w.type}] coverage=${w.details.coverage_pct}% (threshold=${w.details.threshold_pct}%)`);
      }
    }
  }

  if (diag.summary.conflict_graph && diag.summary.conflict_graph.length > 0) {
    console.log(`\n  CONFLICT GRAPH (${diag.summary.conflict_graph.length} components):`);
    for (const comp of diag.summary.conflict_graph) {
      console.log(`    Component: ${comp.eids.join(", ")}`);
      for (const edge of comp.edges) {
        const best = edge.separations[0];
        const alts = edge.separations.slice(1).map((s) => `${s.direction.replace("move_", "")} ${s.cost_px}px`).join(", ");
        console.log(`      ${edge.owner_eid} \u2192 ${edge.other_eid}: ${best ? best.direction.replace("move_", "") + " " + best.cost_px + "px" : "?"}${alts ? " (or: " + alts + ")" : ""}`);
      }
      const envStr = comp.envelopes.map((e) => `${e.eid} \u2191${e.free_top} \u2193${e.free_bottom} \u2190${e.free_left} \u2192${e.free_right}`).join(" | ");
      console.log(`      Space: ${envStr}`);
    }
  }
}

async function main() {
  const outDir = path.resolve("demo-complex-output");
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  // ── Iteration 0: initial broken layout ──
  console.log("\n🔷 ITERATION 0 — Initial layout (broken)");

  const html0 = renderHTML(slide);
  await fs.writeFile(path.join(outDir, "ir_0.json"), JSON.stringify(slide, null, 2));
  await fs.writeFile(path.join(outDir, "out_0.html"), html0);

  const dom0 = await extractDOM(page, html0);
  await fs.writeFile(path.join(outDir, "dom_0.json"), JSON.stringify(dom0, null, 2));

  const png0 = await screenshotSlide(page);
  await fs.writeFile(path.join(outDir, "render_0.png"), png0);

  const diag0 = diagnose(dom0, slide);
  await fs.writeFile(path.join(outDir, "diag_0.json"), JSON.stringify(diag0, null, 2));

  printDiag("ITERATION 0 — DIAGNOSTICS (before patch)", diag0);

  // Debug overlay screenshot (Tool A)
  await page.setContent(html0, { waitUntil: "load" });
  await injectDebugOverlay(page, dom0, { diag: diag0 });
  const debugPng0 = await screenshotSlide(page);
  await fs.writeFile(path.join(outDir, "debug_0.png"), debugPng0);

  // ── Iteration 1: apply fix patch ──
  console.log("\n\n🔷 ITERATION 1 — Applying LLM patch...");

  const { ir: patchedIR, overrides } = applyPatch(slide, fixPatch);
  await fs.writeFile(path.join(outDir, "patch_1.json"), JSON.stringify(fixPatch, null, 2));
  await fs.writeFile(path.join(outDir, "ir_1.json"), JSON.stringify(patchedIR, null, 2));

  if (overrides.length > 0) {
    console.log(`\n  BUDGET OVERRIDES (${overrides.length}):`);
    for (const o of overrides) {
      console.log(`    ${o.eid}.${o.field}: requested ${o.requested} → clamped to ${o.clamped_to}`);
      console.log(`      reason: ${o.reason}`);
    }
  }

  const html1 = renderHTML(patchedIR);
  await fs.writeFile(path.join(outDir, "out_1.html"), html1);

  const dom1 = await extractDOM(page, html1);
  await fs.writeFile(path.join(outDir, "dom_1.json"), JSON.stringify(dom1, null, 2));

  const png1 = await screenshotSlide(page);
  await fs.writeFile(path.join(outDir, "render_1.png"), png1);

  const diag1 = diagnose(dom1, patchedIR);
  await fs.writeFile(path.join(outDir, "diag_1.json"), JSON.stringify(diag1, null, 2));

  printDiag("ITERATION 1 — DIAGNOSTICS (after patch)", diag1);

  // Debug overlay screenshot (Tool A)
  await page.setContent(html1, { waitUntil: "load" });
  await injectDebugOverlay(page, dom1, { diag: diag1 });
  const debugPng1 = await screenshotSlide(page);
  await fs.writeFile(path.join(outDir, "debug_1.png"), debugPng1);

  // ── Summary ──
  console.log(`\n${"=".repeat(70)}`);
  console.log("CONVERGENCE");
  console.log("=".repeat(70));
  console.log(`  iter 0 → defects: ${diag0.summary.defect_count}, severity: ${diag0.summary.total_severity}, warnings: ${diag0.summary.warning_count}`);
  console.log(`  iter 1 → defects: ${diag1.summary.defect_count}, severity: ${diag1.summary.total_severity}, warnings: ${diag1.summary.warning_count}`);

  const quality =
    diag1.summary.defect_count === 0 && diag1.summary.warning_count === 0
      ? "success_clean"
      : diag1.summary.defect_count === 0
        ? "success_with_warnings"
        : "degraded (needs more iterations)";
  console.log(`  quality: ${quality}`);

  await browser.close();

  // ── Generate debug HTML ──
  const fp = computeFingerprint(slide, fixPatch);
  const snapshots: DebugSnapshot[] = [
    { iter: 0, ir: slide, dom: dom0, diag: diag0, tabooFingerprints: [] },
    { iter: 1, ir: patchedIR, dom: dom1, diag: diag1, overrides, patch: fixPatch, fingerprint: fp, tabooFingerprints: [] },
  ];
  const debugHTML = generateDebugHTML(snapshots);
  await fs.writeFile(path.join(outDir, "debug.html"), debugHTML);

  console.log(`\nAll files in: ${outDir}/`);
  console.log(`  iter 0: ir_0.json  out_0.html  render_0.png  debug_0.png  dom_0.json  diag_0.json`);
  console.log(`  iter 1: patch_1.json  ir_1.json  out_1.html  render_1.png  debug_1.png  dom_1.json  diag_1.json`);
  console.log(`  debug:  debug.html (interactive viewer)`);
  console.log(`\nTip: open debug_0.png / debug_1.png to see overlay annotations.`);
  console.log(`  Or run: python visual_debug.py --batch ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
