/**
 * Demo: anchor_eid on ConflictComponent — shows which element is the
 * immovable anchor in each overlap conflict group.
 *
 * Usage: npx tsx demo-anchor.ts
 *
 * Creates demo-anchor-output/ with an interactive debug.html showing
 * two conflict components, each with a clearly identified anchor_eid.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { chromium } from "playwright";
import { parseIR } from "./src/schema/ir.js";
import { renderHTML } from "./src/renderer/html-renderer.js";
import { extractDOM, screenshotSlide } from "./src/extraction/dom-extractor.js";
import { diagnose } from "./src/diagnostics/engine.js";
import { generateDebugHTML } from "./src/debug/visual-debug.js";
import type { DebugSnapshot } from "./src/debug/visual-debug.js";

// ── Slide with two independent overlap clusters ──
//
// Left cluster (A-B-C chain):
//   e_title   (priority 100) ← anchor (highest priority)
//   e_subtitle (priority 70) — overlaps with title
//   e_bullets  (priority 80) — overlaps with subtitle
//
// Right cluster (D-E pair, same priority, different zIndex):
//   e_chart_label (priority 60, zIndex 20) ← anchor (same prio, higher z)
//   e_chart_note  (priority 60, zIndex 10) — overlaps with label

const slide = parseIR({
  slide: { w: 1280, h: 720 },
  elements: [
    {
      eid: "e_bg",
      type: "decoration",
      priority: 10,
      content: "",
      layout: { x: 0, y: 0, w: 1280, h: 720, zIndex: 0 },
      style: { backgroundColor: "#1e293b" },
    },
    // ── Left cluster: title/subtitle/bullets chain ──
    {
      eid: "e_title",
      type: "title",
      priority: 100,
      content: "Conflict Anchor Demo",
      layout: { x: 48, y: 40, w: 550, h: 80, zIndex: 10 },
      style: { fontSize: 44, lineHeight: 1.2, fontWeight: "bold", color: "#f1f5f9" },
    },
    {
      eid: "e_subtitle",
      type: "text",
      priority: 70,
      content: "This subtitle overlaps the title above (safeBoxes collide)",
      // y=100 → safeBox top at 92, overlaps title safeBox bottom at 128
      layout: { x: 48, y: 100, w: 550, h: 60, zIndex: 10 },
      style: { fontSize: 20, lineHeight: 1.4, color: "#94a3b8" },
    },
    {
      eid: "e_bullets",
      type: "bullets",
      priority: 80,
      content: "• First point overlapping subtitle\n• Second point\n• Third point",
      // y=140 → overlaps subtitle which ends at y=160
      layout: { x: 48, y: 140, w: 550, h: 160, zIndex: 10 },
      style: { fontSize: 18, lineHeight: 1.5, color: "#cbd5e1" },
    },
    // ── Right cluster: same priority, zIndex tie-break ──
    {
      eid: "e_chart_label",
      type: "text",
      priority: 60,
      content: "Revenue by Region (zIndex 20 — anchor)",
      layout: { x: 700, y: 400, w: 500, h: 60, zIndex: 20 },
      style: { fontSize: 22, lineHeight: 1.3, fontWeight: "bold", color: "#fbbf24" },
    },
    {
      eid: "e_chart_note",
      type: "text",
      priority: 60,
      content: "Note: overlaps label but lower zIndex (10), so this should move",
      // y=430 → safeBox overlaps chart_label's safeBox
      layout: { x: 700, y: 430, w: 500, h: 60, zIndex: 10 },
      style: { fontSize: 18, lineHeight: 1.4, color: "#94a3b8" },
    },
  ],
});

async function main() {
  const outDir = path.resolve("demo-anchor-output");
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  // ── Render and diagnose ──
  const html = renderHTML(slide);
  const dom = await extractDOM(page, html);
  const diag = diagnose(dom, slide);
  await screenshotSlide(page);

  await browser.close();

  // ── Print conflict graph with anchor_eid ──
  console.log("\n" + "=".repeat(60));
  console.log("CONFLICT GRAPH — anchor_eid Demo");
  console.log("=".repeat(60));
  console.log(`\nDefects: ${diag.summary.defect_count}, Warnings: ${diag.summary.warning_count}\n`);

  const graph = diag.summary.conflict_graph ?? [];
  if (graph.length === 0) {
    console.log("  No conflict components found (elements may not overlap enough).");
  }
  for (let i = 0; i < graph.length; i++) {
    const comp = graph[i]!;
    console.log(`  Component #${i + 1}: [${comp.eids.join(", ")}]`);
    console.log(`    anchor_eid: ${comp.anchor_eid}  ← this element should NOT move`);

    // Show why it's the anchor
    const anchorIR = slide.elements.find((e) => e.eid === comp.anchor_eid);
    const anchorDOM = dom.elements.find((e) => e.eid === comp.anchor_eid);
    if (anchorIR && anchorDOM) {
      console.log(`    (priority=${anchorIR.priority}, zIndex=${anchorDOM.zIndex})`);
    }

    for (const edge of comp.edges) {
      const best = edge.separations[0];
      console.log(`    ${edge.owner_eid} ↔ ${edge.other_eid}: best fix = ${best?.direction} ${best?.cost_px}px`);
    }
    console.log();
  }

  // ── Generate interactive debug HTML ──
  const snapshots: DebugSnapshot[] = [
    { iter: 0, ir: slide, dom, diag },
  ];
  const debugHTML = generateDebugHTML(snapshots);
  await fs.writeFile(path.join(outDir, "debug.html"), debugHTML);
  await fs.writeFile(path.join(outDir, "diag.json"), JSON.stringify(diag, null, 2));

  console.log("=".repeat(60));
  console.log(`Open: ${path.join(outDir, "debug.html")}`);
  console.log(`  → Look at Diagnostics panel → conflict_graph → anchor_eid`);
  console.log(`  → Hover conflict lines on the slide to see which elements conflict`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
