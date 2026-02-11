/**
 * Multi-layer demo: elements at different z-index levels creating
 * occlusion_suspected warnings and cross-layer interactions.
 *
 * Layout:
 *   z=0   full-slide background panel (decoration)
 *   z=5   large hero image spanning most of the slide
 *   z=10  title overlaying the image
 *   z=10  subtitle overlaying the image (overlaps title safeBox)
 *   z=15  feature badge floating on top-right
 *   z=20  CTA button floating over everything
 *   z=20  price tag overlapping hero image (same z → overlap defect with badge at z=15)
 *   z=10  fine-print text at bottom (font too small)
 *
 * Expected defects:
 *   - overlap: title ↔ subtitle (same z, safeBox collision)
 *   - overlap: badge ↔ price_tag (different z → occlusion_suspected warning)
 *   - font_too_small: fine_print
 *   - out_of_bounds: cta_button extends past right edge
 *   - occlusion_suspected: multiple cross-z overlaps
 *
 * Usage: npx tsx demo-layers.ts
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
    // z=15: feature badge floating top-right
    {
      eid: "badge",
      type: "text",
      priority: 50,
      content: "NEW",
      layout: { x: 1050, y: 90, w: 80, h: 36, zIndex: 15 },
      style: { fontSize: 16, lineHeight: 1, fontWeight: "bold", color: "#ffffff", backgroundColor: "#6366f1", borderRadius: 18 },
    },
    // z=20: CTA button — extends past right edge (OOB)
    {
      eid: "cta",
      type: "text",
      priority: 80,
      content: "Start Free Trial",
      layout: { x: 1100, y: 600, w: 220, h: 52, zIndex: 20 },
      style: { fontSize: 20, lineHeight: 1, fontWeight: "bold", color: "#ffffff", backgroundColor: "#16a34a", borderRadius: 26 },
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

async function main() {
  const outDir = path.resolve("demo-layers-output");
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
  console.log("Multi-Layer Demo");
  console.log("=".repeat(50));
  console.log(`  Elements: ${slide.elements.length}`);
  console.log(`  z-index levels: ${[...new Set(slide.elements.map((e) => e.layout.zIndex))].sort().join(", ")}`);
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

  console.log(`\nOutput: ${outDir}/`);
  console.log(`  open debug.html or debug_0.png`);
}

main().catch((err) => { console.error(err); process.exit(1); });
