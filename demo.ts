/**
 * Demo: run the full pipeline on a slide with known defects.
 *
 * Usage: npx tsx demo.ts
 *
 * Creates demo-output/ with:
 *   - ir.json        (input IR)
 *   - slide.html     (rendered HTML)
 *   - render.png     (screenshot)
 *   - dom.json       (Playwright DOM extraction)
 *   - diag.json      (structured diagnostics)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { chromium } from "playwright";
import { parseIR } from "./src/schema/ir.js";
import { renderHTML } from "./src/renderer/html-renderer.js";
import { extractDOM, screenshotSlide } from "./src/extraction/dom-extractor.js";
import { diagnose } from "./src/diagnostics/engine.js";

// A slide with multiple deliberate defects:
// 1. Title and bullets overlap vertically (same zIndex, safeBoxes intersect)
// 2. Bullets have too much text for their container (content overflow)
// 3. Caption font is below minimum for its priority tier
// 4. Image extends beyond the right edge of the slide (out of bounds)
const problematicIR = parseIR({
  slide: { w: 1280, h: 720 },
  elements: [
    {
      eid: "e_bg",
      type: "decoration",
      priority: 20,
      content: "",
      layout: { x: 0, y: 0, w: 1280, h: 720, zIndex: 0 },
      style: { backgroundColor: "#f5f5f0" },
    },
    {
      eid: "e_title",
      type: "title",
      priority: 100,
      content: "Quarterly Revenue Analysis",
      layout: { x: 48, y: 40, w: 900, h: 80, zIndex: 10 },
      style: { fontSize: 44, lineHeight: 1.2, fontWeight: "bold" },
    },
    {
      eid: "e_bullets",
      type: "bullets",
      priority: 80,
      // Overlap: bullets start at y=100, title ends at y=120 → safeBoxes collide
      // Overflow: 8 bullet items in a 200px-tall container
      content:
        "• Revenue up 23% year-over-year driven by cloud services\n• Enterprise segment grew 31%, exceeding analyst estimates\n• Consumer segment flat at $2.1B amid market headwinds\n• Operating margins expanded 240bps to 38.2%\n• Free cash flow of $4.7B, up from $3.9B prior year\n• Guidance raised for Q4: expecting $12.8-13.1B revenue\n• New product launches contributed $800M incremental\n• International markets showed 18% constant-currency growth",
      layout: { x: 48, y: 100, w: 700, h: 200, zIndex: 10 },
      style: { fontSize: 18, lineHeight: 1.6 },
    },
    {
      eid: "e_image",
      type: "image",
      priority: 40,
      content: "https://via.placeholder.com/400x350?text=Revenue+Chart",
      // Out of bounds: x=950 + w=400 = 1350 > 1280
      layout: { x: 950, y: 150, w: 400, h: 350, zIndex: 10 },
      style: {},
    },
    {
      eid: "e_caption",
      type: "text",
      priority: 60,
      content: "Source: Internal Finance Team, FY2025 Q3 Report",
      layout: { x: 48, y: 660, w: 500, h: 40, zIndex: 10 },
      // Font too small: 12px < 16px minimum for priority 60
      style: { fontSize: 12, lineHeight: 1.4, color: "#888" },
    },
  ],
});

async function main() {
  const outDir = path.resolve("demo-output");
  await fs.mkdir(outDir, { recursive: true });

  // 1. Write IR
  const irPath = path.join(outDir, "ir.json");
  await fs.writeFile(irPath, JSON.stringify(problematicIR, null, 2));
  console.log("✓ IR written to", irPath);

  // 2. Render HTML
  const html = renderHTML(problematicIR);
  const htmlPath = path.join(outDir, "slide.html");
  await fs.writeFile(htmlPath, html);
  console.log("✓ HTML written to", htmlPath);
  console.log("  (open in browser to see the raw layout)\n");

  // 3. Playwright: extract DOM + screenshot
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  const dom = await extractDOM(page, html);
  const domPath = path.join(outDir, "dom.json");
  await fs.writeFile(domPath, JSON.stringify(dom, null, 2));
  console.log("✓ DOM extraction written to", domPath);

  const screenshot = await screenshotSlide(page);
  const pngPath = path.join(outDir, "render.png");
  await fs.writeFile(pngPath, screenshot);
  console.log("✓ Screenshot written to", pngPath);

  await browser.close();

  // 4. Diagnose
  const diag = diagnose(dom, problematicIR);
  const diagPath = path.join(outDir, "diag.json");
  await fs.writeFile(diagPath, JSON.stringify(diag, null, 2));
  console.log("✓ Diagnostics written to", diagPath);

  // 5. Pretty-print summary
  console.log("\n" + "=".repeat(70));
  console.log("DIAGNOSTICS SUMMARY");
  console.log("=".repeat(70));
  console.log(`  Defects:  ${diag.summary.defect_count}`);
  console.log(`  Warnings: ${diag.summary.warning_count}`);
  console.log(`  Severity: ${diag.summary.total_severity}`);

  if (diag.defects.length > 0) {
    console.log("\n--- DEFECTS ---");
    for (const d of diag.defects) {
      const eid = d.eid ?? d.owner_eid ?? "?";
      console.log(`\n  [${d.type}] ${eid}  (severity: ${d.severity})`);
      console.log(`    details: ${JSON.stringify(d.details)}`);
      if (d.other_eid) console.log(`    other:   ${d.other_eid}`);
      if (d.hint) {
        const { action, validated, reason, ...values } = d.hint;
        console.log(
          `    hint:    ${action} ${JSON.stringify(values)}${validated ? " ✓validated" : ""}`
        );
        if (reason) console.log(`             ${reason}`);
      }
    }
  }

  if (diag.warnings.length > 0) {
    console.log("\n--- WARNINGS ---");
    for (const w of diag.warnings) {
      if (w.type === "occlusion_suspected") {
        console.log(`\n  [${w.type}] ${w.owner_eid} ↔ ${w.other_eid}`);
        console.log(`    details: ${JSON.stringify(w.details)}`);
      } else {
        console.log(`\n  [${w.type}] coverage=${w.details.coverage_pct}% (threshold=${w.details.threshold_pct}%)`);
      }
    }
  }

  if (diag.summary.conflict_graph && diag.summary.conflict_graph.length > 0) {
    console.log(`\n--- CONFLICT GRAPH (${diag.summary.conflict_graph.length} components) ---`);
    for (const comp of diag.summary.conflict_graph) {
      console.log(`  Component: ${comp.eids.join(", ")}`);
      for (const edge of comp.edges) {
        const best = edge.separations[0];
        const alts = edge.separations.slice(1).map((s: { direction: string; cost_px: number }) => `${s.direction.replace("move_", "")} ${s.cost_px}px`).join(", ");
        console.log(`    ${edge.owner_eid} → ${edge.other_eid}: ${best ? best.direction.replace("move_", "") + " " + best.cost_px + "px" : "?"}${alts ? " (or: " + alts + ")" : ""}`);
      }
      const envStr = comp.envelopes.map((e: { eid: string; free_top: number; free_bottom: number; free_left: number; free_right: number }) => `${e.eid} ↑${e.free_top} ↓${e.free_bottom} ←${e.free_left} →${e.free_right}`).join(" | ");
      console.log(`    Space: ${envStr}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log(
    `Output files in: ${outDir}\n` +
      `  ir.json     - input IR (open to see element definitions)\n` +
      `  slide.html  - open in browser to see the rendered slide\n` +
      `  render.png  - Playwright screenshot\n` +
      `  dom.json    - extracted bounding boxes & contentBox measurements\n` +
      `  diag.json   - full structured diagnostics (feed this to the LLM)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
