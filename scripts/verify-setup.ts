/**
 * verify-setup.ts — Quick smoke test for container setup.
 * Validates that all PPTAgent modules load, Playwright can launch,
 * and the diagnostics pipeline produces correct output.
 *
 * Usage: npx tsx scripts/verify-setup.ts
 * Exit code 0 = all good, non-zero = setup broken.
 */

import { parseIR } from "../src/schema/ir.js";
import { launchBrowser } from "../src/utils/browser.js";
import { parsePatch } from "../src/schema/patch.js";
import { renderHTML } from "../src/renderer/html-renderer.js";
import { extractDOM } from "../src/extraction/dom-extractor.js";
import { diagnose } from "../src/diagnostics/engine.js";
import { applyPatch } from "../src/patch/apply-patch.js";
import { createSession } from "../src/driver/loop-driver.js";

async function verify() {
  const checks: string[] = [];

  // 1. Schema parsing
  const ir = parseIR({
    slide: { w: 1280, h: 720 },
    elements: [
      {
        eid: "e1",
        type: "title",
        priority: 100,
        content: "Setup Test",
        layout: { x: 40, y: 40, w: 400, h: 60 },
        style: { fontSize: 36 },
      },
    ],
  });
  checks.push("schema parsing");

  // 2. HTML rendering
  const html = renderHTML(ir);
  if (!html.includes("data-eid")) throw new Error("renderHTML missing data-eid");
  checks.push("HTML rendering");

  // 3. Playwright launch + DOM extraction
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  const dom = await extractDOM(page, html);
  if (dom.elements.length !== 1) throw new Error(`Expected 1 DOM element, got ${dom.elements.length}`);
  checks.push("Playwright + DOM extraction");

  // 4. Diagnostics
  const diag = diagnose(dom, ir);
  if (typeof diag.summary.defect_count !== "number") throw new Error("Diagnostics missing defect_count");
  checks.push("diagnostics engine");

  // 5. Patch apply
  const patch = parsePatch({ edits: [{ eid: "e1", layout: { x: 50 } }] });
  const { ir: patched, overrides } = applyPatch(ir, patch);
  if (patched.elements[0]!.layout.x !== 50) throw new Error("applyPatch failed");
  checks.push("patch apply");

  // 6. Session creation
  const session = createSession(page, "/tmp/verify-test");
  if (!session) throw new Error("createSession returned null");
  checks.push("session creation");

  await browser.close();

  console.log(`  All checks passed: ${checks.join(", ")}`);
}

verify().catch((err) => {
  console.error("Setup verification FAILED:", err);
  process.exit(1);
});
