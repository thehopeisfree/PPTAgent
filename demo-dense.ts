/**
 * Dense demo: a "Q3 Executive Dashboard" with 14 elements creating
 * overlapping defect chains, multiple simultaneous defect types,
 * and a long conflict chain.
 *
 * Layout (intended):
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ [accent bar]                                             │
 *   │  Q3 EXECUTIVE DASHBOARD             [logo]   [date]     │
 *   │                                                          │
 *   │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                   │
 *   │  │ KPI1 │ │ KPI2 │ │ KPI3 │ │ KPI4 │                   │
 *   │  └──────┘ └──────┘ └──────┘ └──────┘                   │
 *   │                                                          │
 *   │  ┌─────────────────┐  ┌─────────────────┐              │
 *   │  │  chart_left     │  │  chart_right    │              │
 *   │  └─────────────────┘  └─────────────────┘              │
 *   │                                                          │
 *   │  Key takeaways (bullets)              [call-to-action]   │
 *   │  Source: ...                                             │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Baked-in problems:
 *   1. Title and date overlap (x ranges collide)
 *   2. KPI cards packed too tight (safeBox overlaps between 1↔2, 2↔3, 3↔4)
 *   3. chart_right extends past right edge (OOB)
 *   4. Bullets overflow container (too much text)
 *   5. Source caption font too small
 *   6. Logo font too small for its priority
 *   7. KPI chain: 4-element overlap chain
 *
 * Usage: npx tsx demo-dense.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { chromium } from "playwright";
import { parseIR } from "./src/schema/ir.js";
import { renderHTML } from "./src/renderer/html-renderer.js";
import { extractDOM, screenshotSlide } from "./src/extraction/dom-extractor.js";
import { diagnose } from "./src/diagnostics/engine.js";
import { generateDebugHTML } from "./src/debug/visual-debug.js";
import { injectDebugOverlay } from "./src/debug/overlay.js";
import type { DebugSnapshot } from "./src/debug/visual-debug.js";

const slide = parseIR({
  slide: { w: 1280, h: 720 },
  elements: [
    // ── decoration: left accent bar ──
    {
      eid: "accent",
      type: "decoration",
      priority: 5,
      content: "",
      layout: { x: 0, y: 0, w: 8, h: 720, zIndex: 0 },
      style: { backgroundColor: "#7c3aed" },
    },
    // ── decoration: background ──
    {
      eid: "bg",
      type: "decoration",
      priority: 5,
      content: "",
      layout: { x: 0, y: 0, w: 1280, h: 720, zIndex: 0 },
      style: { backgroundColor: "#f8fafc" },
    },
    // ── title ──
    {
      eid: "title",
      type: "title",
      priority: 100,
      content: "Q3 Executive Dashboard",
      layout: { x: 32, y: 20, w: 600, h: 56, zIndex: 10 },
      style: { fontSize: 36, lineHeight: 1.2, fontWeight: "bold", color: "#1e293b" },
    },
    // ── logo ──
    {
      eid: "logo",
      type: "text",
      priority: 60,
      content: "Acme Corp",
      // font 11px < 16px min for priority 60
      layout: { x: 1080, y: 20, w: 160, h: 28, zIndex: 10 },
      style: { fontSize: 11, lineHeight: 1, fontWeight: "bold", color: "#7c3aed" },
    },
    // ── date ── overlaps with title (x ranges collide: title ends at 632, date starts at 600)
    {
      eid: "date",
      type: "text",
      priority: 50,
      content: "October 2025 | Confidential",
      layout: { x: 600, y: 24, w: 280, h: 28, zIndex: 10 },
      style: { fontSize: 14, lineHeight: 1.2, color: "#64748b" },
    },
    // ── KPI cards: packed too tight, safeBoxes collide ──
    {
      eid: "kpi1",
      type: "text",
      priority: 70,
      content: "Revenue\n$4.2M\n+18% QoQ",
      layout: { x: 32, y: 90, w: 270, h: 90, zIndex: 10 },
      style: { fontSize: 16, lineHeight: 1.4, color: "#1e293b", backgroundColor: "#ffffff", borderRadius: 8 },
    },
    {
      eid: "kpi2",
      type: "text",
      priority: 70,
      content: "Active Users\n128K\n+34% QoQ",
      // gap between kpi1 and kpi2 is only 4px (302-306) → safeBox collision
      layout: { x: 306, y: 90, w: 270, h: 90, zIndex: 10 },
      style: { fontSize: 16, lineHeight: 1.4, color: "#1e293b", backgroundColor: "#ffffff", borderRadius: 8 },
    },
    {
      eid: "kpi3",
      type: "text",
      priority: 70,
      content: "NPS Score\n72\n+8 points",
      layout: { x: 580, y: 90, w: 270, h: 90, zIndex: 10 },
      style: { fontSize: 16, lineHeight: 1.4, color: "#1e293b", backgroundColor: "#ffffff", borderRadius: 8 },
    },
    {
      eid: "kpi4",
      type: "text",
      priority: 70,
      content: "Churn Rate\n2.1%\n-0.8% QoQ",
      layout: { x: 854, y: 90, w: 270, h: 90, zIndex: 10 },
      style: { fontSize: 16, lineHeight: 1.4, color: "#1e293b", backgroundColor: "#ffffff", borderRadius: 8 },
    },
    // ── charts ──
    {
      eid: "chart_left",
      type: "image",
      priority: 40,
      content: "https://via.placeholder.com/560x240/e2e8f0/475569?text=Revenue+Trend",
      layout: { x: 32, y: 210, w: 560, h: 240, zIndex: 10 },
      style: { borderRadius: 8 },
    },
    {
      eid: "chart_right",
      type: "image",
      priority: 40,
      content: "https://via.placeholder.com/560x240/e2e8f0/475569?text=User+Growth",
      // x=620 + w=560 = 1180... but let's push it OOB:
      // x=740 + w=560 = 1300 > 1280 → out of bounds right
      layout: { x: 740, y: 210, w: 560, h: 240, zIndex: 10 },
      style: { borderRadius: 8 },
    },
    // ── key takeaways: too much text for the height ──
    {
      eid: "takeaways",
      type: "bullets",
      priority: 80,
      content:
        "• Revenue exceeded targets by 12%, driven by enterprise expansion\n" +
        "• User acquisition costs decreased 23% through organic channel optimization\n" +
        "• Infrastructure costs held flat despite 34% user growth (efficiency win)\n" +
        "• Three strategic partnerships signed: Microsoft, Salesforce, Datadog\n" +
        "• Customer health scores improved across all tiers, churn at historic low\n" +
        "• Mobile app launch drove 40% of new signups in September alone",
      // 6 long bullets in 140px → guaranteed overflow
      layout: { x: 32, y: 480, w: 700, h: 140, zIndex: 10 },
      style: { fontSize: 14, lineHeight: 1.5, color: "#334155" },
    },
    // ── CTA box ──
    {
      eid: "cta",
      type: "text",
      priority: 60,
      content: "Next Steps: Board presentation Nov 3. Finalize FY26 targets by Oct 25.",
      layout: { x: 780, y: 500, w: 460, h: 80, zIndex: 10 },
      style: { fontSize: 15, lineHeight: 1.5, color: "#7c3aed", backgroundColor: "#f5f3ff", borderRadius: 8 },
    },
    // ── source line — font too small ──
    {
      eid: "source",
      type: "text",
      priority: 60,
      content: "Data: Internal Analytics Platform · Figures unaudited · Generated 2025-10-15T09:30Z",
      layout: { x: 32, y: 685, w: 700, h: 22, zIndex: 10 },
      // font 9px < 16px minimum for priority 60
      style: { fontSize: 9, lineHeight: 1.2, color: "#94a3b8" },
    },
  ],
});

async function main() {
  const outDir = path.resolve("demo-dense-output");
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  const html = renderHTML(slide);
  await fs.writeFile(path.join(outDir, "ir_0.json"), JSON.stringify(slide, null, 2));
  await fs.writeFile(path.join(outDir, "out_0.html"), html);

  const dom = await extractDOM(page, html);
  await fs.writeFile(path.join(outDir, "dom_0.json"), JSON.stringify(dom, null, 2));

  const png = await screenshotSlide(page);
  await fs.writeFile(path.join(outDir, "render_0.png"), png);

  const diag = diagnose(dom, slide);
  await fs.writeFile(path.join(outDir, "diag_0.json"), JSON.stringify(diag, null, 2));

  // Debug overlay screenshot
  await page.setContent(html, { waitUntil: "load" });
  await injectDebugOverlay(page, dom, { diag });
  const debugPng = await screenshotSlide(page);
  await fs.writeFile(path.join(outDir, "debug_0.png"), debugPng);

  await browser.close();

  // Debug HTML
  const snapshots: DebugSnapshot[] = [{ iter: 0, ir: slide, dom, diag }];
  await fs.writeFile(path.join(outDir, "debug.html"), generateDebugHTML(snapshots));

  // Print summary
  console.log("Dense Dashboard Demo (14 elements)");
  console.log("=".repeat(50));
  console.log(`  Elements: ${slide.elements.length}`);
  console.log(`  Defects:  ${diag.summary.defect_count}`);
  console.log(`  Warnings: ${diag.summary.warning_count}`);
  console.log(`  Severity: ${diag.summary.total_severity}`);

  if (diag.defects.length > 0) {
    console.log("\n  DEFECTS:");
    for (const d of diag.defects) {
      const eid = d.eid ?? d.owner_eid ?? "?";
      const other = d.other_eid ? ` (vs ${d.other_eid})` : "";
      console.log(`    [${d.type}] ${eid}${other}  severity=${d.severity}`);
    }
  }
  if (diag.warnings.length > 0) {
    console.log("\n  WARNINGS:");
    for (const w of diag.warnings) {
      console.log(`    [${w.type}] ${w.owner_eid} <-> ${w.other_eid}  (top: ${w.details.top_eid})`);
    }
  }
  if (diag.summary.conflict_chain && diag.summary.conflict_chain.length > 0) {
    console.log(`\n  CONFLICT CHAIN: ${diag.summary.conflict_chain.join(" \u2192 ")}  (feasible: ${diag.summary.chain_feasible})`);
  }

  console.log(`\nOutput: ${outDir}/`);
  console.log(`  open debug.html or debug_0.png`);
}

main().catch((err) => { console.error(err); process.exit(1); });
