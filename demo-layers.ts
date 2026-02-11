/**
 * Multi-layer demo: elements at different z-index levels creating
 * occlusion_suspected warnings and cross-layer interactions.
 *
 * Demonstrates the `group` field: badge (shape + label) and CTA (shape + label)
 * are each grouped so intra-group overlaps are exempt from detection,
 * while cross-group conflicts (e.g. badge vs price) remain flagged.
 *
 * Runs 3 iterations:
 *   iter 0: initial broken layout
 *   iter 1: fix font + CTA OOB + move subtitle (still tight)
 *   iter 2: clear subtitle properly + move desc below hero + separate badge/price
 *
 * Usage: npx tsx demo-layers.ts
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
    // z=0: full background
    {
      eid: "bg",
      type: "decoration",
      priority: 5,
      content: "",
      layout: { x: 0, y: 0, w: 1280, h: 720, zIndex: 0 },
      style: { backgroundColor: "#0f172a" },
    },
    // z=0: accent stripe (decoration, exempt from overlap)
    {
      eid: "stripe",
      type: "decoration",
      priority: 5,
      content: "",
      layout: { x: 0, y: 280, w: 1280, h: 4, zIndex: 0 },
      style: { backgroundColor: "#6366f1" },
    },
    // z=5: hero image — large, spanning center
    {
      eid: "hero_img",
      type: "image",
      priority: 30,
      content: "https://via.placeholder.com/900x500/1e293b/475569?text=Hero+Product+Shot",
      layout: { x: 60, y: 80, w: 900, h: 500, zIndex: 5 },
      style: { borderRadius: 12 },
    },
    // z=10: title overlaying the hero image
    {
      eid: "title",
      type: "title",
      priority: 100,
      content: "Introducing CloudSync Pro",
      layout: { x: 80, y: 100, w: 700, h: 80, zIndex: 10 },
      style: { fontSize: 48, lineHeight: 1.2, fontWeight: "bold", color: "#ffffff" },
    },
    // z=10: subtitle — deliberately too close to title (overlap)
    {
      eid: "subtitle",
      type: "text",
      priority: 70,
      content: "Real-time collaboration for distributed teams — now with AI-powered conflict resolution",
      // y=165, title bottom ~180 → safeBox collision
      layout: { x: 80, y: 165, w: 650, h: 40, zIndex: 10 },
      style: { fontSize: 18, lineHeight: 1.4, color: "#cbd5e1" },
    },
    // z=15: feature badge — shape + label, grouped (text on shape)
    {
      eid: "badge_bg",
      type: "text",
      priority: 30,
      content: "",
      layout: { x: 1050, y: 90, w: 80, h: 36, zIndex: 15 },
      style: { backgroundColor: "#6366f1", borderRadius: 18 },
      group: "badge",
    },
    {
      eid: "badge_label",
      type: "text",
      priority: 50,
      content: "NEW",
      layout: { x: 1050, y: 90, w: 80, h: 36, zIndex: 16 },
      style: { fontSize: 16, lineHeight: 1, fontWeight: "bold", color: "#ffffff", textAlign: "center" },
      group: "badge",
    },
    // z=20: CTA button — shape + label, grouped (text on shape); extends past right edge (OOB)
    {
      eid: "cta_bg",
      type: "text",
      priority: 60,
      content: "",
      layout: { x: 1100, y: 600, w: 220, h: 52, zIndex: 20 },
      style: { backgroundColor: "#16a34a", borderRadius: 26 },
      group: "cta",
    },
    {
      eid: "cta_label",
      type: "text",
      priority: 80,
      content: "Start Free Trial",
      layout: { x: 1100, y: 600, w: 220, h: 52, zIndex: 21 },
      style: { fontSize: 20, lineHeight: 1, fontWeight: "bold", color: "#ffffff", textAlign: "center" },
      group: "cta",
    },
    // z=20: price tag — overlaps with badge (cross-z: occlusion_suspected)
    {
      eid: "price",
      type: "text",
      priority: 60,
      content: "$29/mo",
      layout: { x: 1020, y: 100, w: 140, h: 44, zIndex: 20 },
      style: { fontSize: 28, lineHeight: 1, fontWeight: "bold", color: "#fbbf24" },
    },
    // z=5: description text partially behind image (same z)
    {
      eid: "desc",
      type: "text",
      priority: 40,
      content: "Sync files across devices instantly. End-to-end encrypted. Works offline. Integrates with 200+ apps including Slack, Notion, and Figma.",
      layout: { x: 80, y: 380, w: 500, h: 100, zIndex: 5 },
      style: { fontSize: 15, lineHeight: 1.6, color: "#94a3b8" },
    },
    // z=10: fine print — font too small
    {
      eid: "fine_print",
      type: "text",
      priority: 60,
      content: "Terms apply. Free trial requires credit card. Cancel anytime. See cloudpro.example.com/terms for details.",
      layout: { x: 60, y: 660, w: 500, h: 24, zIndex: 10 },
      style: { fontSize: 9, lineHeight: 1.2, color: "#475569" },
    },
  ],
});

// ── Patch 1: fix font + CTA OOB (both bg & label move together) + move subtitle ──
// cta_label has priority 80: x move of 40px ≤ 48px budget → not clamped
// Both cta_bg and cta_label must move in sync (group "cta")
const patch1 = parsePatch({
  edits: [
    { eid: "fine_print", style: { fontSize: 16 } },
    { eid: "cta_bg", layout: { x: 1060, w: 200 } },
    { eid: "cta_label", layout: { x: 1060, w: 200 } },
    { eid: "subtitle", layout: { y: 190 } },
  ],
});

// ── Patch 2: clear subtitle properly + move desc below hero + separate badge/price ──
// badge_bg and badge_label move together (group "badge")
const patch2 = parsePatch({
  edits: [
    { eid: "subtitle", layout: { y: 205, h: 50 } },
    { eid: "desc", layout: { y: 600, h: 80 } },
    { eid: "badge_bg", layout: { x: 1160, y: 90 } },
    { eid: "badge_label", layout: { x: 1160, y: 90 } },
    { eid: "price", layout: { x: 1060, y: 160 } },
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
      console.log(`    [${w.type}] ${w.owner_eid} <-> ${w.other_eid}  (top: ${w.details.top_eid}, area: ${w.details.overlap_area_px}px\u00B2)`);
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
  const outDir = path.resolve("demo-layers-output");
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
    const zLevels = [...new Set(s.ir.elements.map((e) => e.layout.zIndex))].sort().join(", ");
    console.log(`  iter ${s.iter} → defects: ${s.diag.summary.defect_count}, severity: ${s.diag.summary.total_severity}, warnings: ${s.diag.summary.warning_count}  (z-levels: ${zLevels})`);
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
