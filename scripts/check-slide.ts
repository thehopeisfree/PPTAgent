#!/usr/bin/env npx tsx
/**
 * check-slide.ts — Validate an HTML slide.
 *
 * Usage:
 *   npx tsx scripts/check-slide.ts <slide.html> [input.json] [screenshot.png]
 *   npx tsx scripts/check-slide.ts <slide.html> [input.json] --outdir <dir> --iter <n>
 *
 * If input.json is omitted, element types and priorities are inferred from the
 * rendered HTML (bold+large→title, <ul>→bullets, <img>→image, etc.).
 *
 * Options:
 *   --outdir <dir>  Save all artifacts (dom, diag, screenshot) to rollout dir
 *   --iter <n>      Iteration number for file naming (default: 0)
 *
 * Output (stdout):
 *   Diagnostics JSON — defects, warnings, summary, conflict graph.
 *
 * Exit codes:
 *   0 — clean (no defects)
 *   1 — has defects (diagnostics printed to stdout)
 *   2 — usage error or file not found
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  parseIR,
  launchBrowser,
  extractDOM,
  screenshotSlide,
  diagnose,
  inferIR,
  rolloutPaths,
  writeJSON,
  writeFile,
} from "../dist/index.js";

// ── Parse args ──
const args = process.argv.slice(2);
const positional: string[] = [];
let outdir: string | undefined;
let iter = 0;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--outdir" && args[i + 1]) {
    outdir = args[++i];
  } else if (args[i] === "--iter" && args[i + 1]) {
    iter = parseInt(args[++i], 10);
  } else {
    positional.push(args[i]);
  }
}

const htmlPath = positional[0];
const irPath = positional[1];
const screenshotPath = positional[2]; // legacy: 3rd positional arg

if (!htmlPath) {
  const prog = process.argv[1];
  console.error(`Usage: ${prog} <slide.html> [input.json] [screenshot.png]`);
  console.error(`       ${prog} <slide.html> [input.json] --outdir <dir> --iter <n>`);
  console.error("");
  console.error("Validates the HTML slide and prints diagnostics JSON.");
  console.error("If input.json is omitted, element types and priorities are inferred from HTML.");
  console.error("Exit 0 = clean, exit 1 = has defects, exit 2 = error.");
  process.exit(2);
}

if (!fs.existsSync(htmlPath)) {
  console.error(`Error: HTML file not found: ${htmlPath}`);
  process.exit(2);
}
if (irPath && !fs.existsSync(irPath)) {
  console.error(`Error: IR file not found: ${irPath}`);
  process.exit(2);
}

// ── Run ──
async function main() {
  // Read inputs
  const html = fs.readFileSync(path.resolve(htmlPath!), "utf-8");

  // Launch browser
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  // Extract DOM
  const dom = await extractDOM(page, html);

  // Build IR: from file if provided, otherwise infer from rendered HTML
  let ir;
  if (irPath) {
    const irData = JSON.parse(fs.readFileSync(path.resolve(irPath), "utf-8"));
    ir = parseIR(irData);
  } else {
    ir = await inferIR(page, dom);
    console.error("No input.json provided — IR inferred from HTML.");
  }

  // Screenshot
  const png = await screenshotSlide(page);
  if (screenshotPath) {
    fs.writeFileSync(path.resolve(screenshotPath), png);
  }

  await browser.close();

  // Diagnose
  const diag = diagnose(dom, ir);

  // Save artifacts to rollout dir if --outdir specified
  if (outdir) {
    const paths = rolloutPaths(outdir, iter);
    await writeFile(paths.html, html);
    await writeJSON(paths.dom, dom);
    await writeJSON(paths.diag, diag);
    await writeFile(paths.render, png);
    console.error(`Artifacts saved to ${outdir}/ (iter ${iter})`);
  }

  // Output
  console.log(JSON.stringify(diag, null, 2));

  // Exit code
  process.exit(diag.summary.defect_count > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(2);
});
