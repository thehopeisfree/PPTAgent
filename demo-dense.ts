/**
 * Dense demo: a "Q3 Executive Dashboard" with 14 elements creating
 * overlapping defect chains, multiple simultaneous defect types,
 * and a long conflict chain.
 *
 * Now runs 3 iterations:
 *   iter 0: initial broken layout (12 defects)
 *   iter 1: fix fonts + OOB + move date/KPIs down (some KPI overlaps remain, takeaways clamped)
 *   iter 2: spread KPI cards + grow takeaways (clean or near-clean)
 *
 * Usage: npx tsx demo-dense.ts
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
import { injectDebugOverlay } from "./src/debug/overlay.js";
import { computeFingerprint } from "./src/driver/loop-driver.js";
import type { DebugSnapshot } from "./src/debug/visual-debug.js";
import type { PatchDocument } from "./src/schema/patch.js";

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

// ── Patch 1: fix fonts + OOB + move date/KPIs clear of title ──
// Takeaways h will be clamped (priority 80, 42% increase > 15% budget)
const patch1 = parsePatch({
  edits: [
    { eid: "logo", style: { fontSize: 16 } },
    { eid: "source", style: { fontSize: 16 } },
    { eid: "cta", style: { fontSize: 16 } },
    { eid: "takeaways", style: { fontSize: 16 }, layout: { h: 200 } },
    { eid: "chart_right", layout: { x: 620 } },
    { eid: "date", layout: { x: 700 } },
    { eid: "kpi1", layout: { y: 100 } },
    { eid: "kpi2", layout: { y: 100 } },
    { eid: "kpi3", layout: { y: 100 } },
    { eid: "kpi4", layout: { y: 100 } },
  ],
});

// ── Patch 2: spread KPI cards (narrow + gap) + grow takeaways again ──
const patch2 = parsePatch({
  edits: [
    { eid: "takeaways", layout: { h: 220 } },
    { eid: "kpi1", layout: { x: 32, w: 250 } },
    { eid: "kpi2", layout: { x: 302, w: 250 } },
    { eid: "kpi3", layout: { x: 572, w: 250 } },
    { eid: "kpi4", layout: { x: 842, w: 250 } },
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
      console.log(`    [${w.type}] ${w.owner_eid} <-> ${w.other_eid}  (top: ${w.details.top_eid})`);
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
  const outDir = path.resolve("demo-dense-output");
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  const patches = [patch1, patch2];
  const snapshots: DebugSnapshot[] = [];
  const tabooFPs: string[] = [];
  let currentIR = slide;

  for (let iter = 0; iter <= patches.length; iter++) {
    const label = iter === 0 ? "Initial layout (broken)" : `After patch ${iter}`;
    console.log(`\n\u{1F537} ITERATION ${iter} — ${label}`);

    // Apply patch (except iter 0)
    let overrides: Awaited<ReturnType<typeof applyPatch>>["overrides"] = [];
    let iterPatch: PatchDocument | undefined;
    let fingerprint: string | undefined;
    if (iter > 0) {
      const patchData = patches[iter - 1]!;
      iterPatch = patchData;
      fingerprint = computeFingerprint(currentIR, patchData);
      const result = applyPatch(currentIR, patchData);
      currentIR = result.ir;
      overrides = result.overrides;
      await fs.writeFile(path.join(outDir, `patch_${iter}.json`), JSON.stringify(patchData, null, 2));
      await fs.writeFile(path.join(outDir, `ir_${iter}.json`), JSON.stringify(currentIR, null, 2));

      if (overrides.length > 0) {
        console.log(`\n  BUDGET OVERRIDES (${overrides.length}):`);
        for (const o of overrides) {
          console.log(`    ${o.eid}.${o.field}: requested ${o.requested} → clamped to ${o.clamped_to}`);
          console.log(`      reason: ${o.reason}`);
        }
      }
    } else {
      await fs.writeFile(path.join(outDir, `ir_${iter}.json`), JSON.stringify(currentIR, null, 2));
    }

    // Render + extract + diagnose
    const html = renderHTML(currentIR);
    await fs.writeFile(path.join(outDir, `out_${iter}.html`), html);

    const dom = await extractDOM(page, html);
    await fs.writeFile(path.join(outDir, `dom_${iter}.json`), JSON.stringify(dom, null, 2));

    const png = await screenshotSlide(page);
    await fs.writeFile(path.join(outDir, `render_${iter}.png`), png);

    const diag = diagnose(dom, currentIR);
    await fs.writeFile(path.join(outDir, `diag_${iter}.json`), JSON.stringify(diag, null, 2));

    printDiag(`ITERATION ${iter} — ${label}`, diag);

    // Debug overlay screenshot
    await page.setContent(html, { waitUntil: "load" });
    await injectDebugOverlay(page, dom, { diag });
    const debugPng = await screenshotSlide(page);
    await fs.writeFile(path.join(outDir, `debug_${iter}.png`), debugPng);

    snapshots.push({
      iter, ir: currentIR, dom, diag,
      overrides: overrides.length > 0 ? overrides : undefined,
      patch: iterPatch,
      fingerprint,
      tabooFingerprints: [...tabooFPs],
    });
  }

  await browser.close();

  // ── Summary ──
  console.log(`\n${"=".repeat(70)}`);
  console.log("CONVERGENCE");
  console.log("=".repeat(70));
  for (const s of snapshots) {
    console.log(`  iter ${s.iter} → defects: ${s.diag.summary.defect_count}, severity: ${s.diag.summary.total_severity}, warnings: ${s.diag.summary.warning_count}`);
  }
  const last = snapshots[snapshots.length - 1]!;
  const quality =
    last.diag.summary.defect_count === 0 && last.diag.summary.warning_count === 0
      ? "success_clean"
      : last.diag.summary.defect_count === 0
        ? "success_with_warnings"
        : "degraded (needs more iterations)";
  console.log(`  quality: ${quality}`);

  // Debug HTML
  await fs.writeFile(path.join(outDir, "debug.html"), generateDebugHTML(snapshots));

  console.log(`\nAll files in: ${outDir}/`);
  for (let i = 0; i < snapshots.length; i++) {
    const files = i === 0
      ? `ir_0.json  out_0.html  render_0.png  debug_0.png  dom_0.json  diag_0.json`
      : `patch_${i}.json  ir_${i}.json  out_${i}.html  render_${i}.png  debug_${i}.png  dom_${i}.json  diag_${i}.json`;
    console.log(`  iter ${i}: ${files}`);
  }
  console.log(`  debug:  debug.html (interactive viewer)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
