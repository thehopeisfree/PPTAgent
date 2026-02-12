#!/usr/bin/env npx tsx
/**
 * replay.ts — Generate a visual debug HTML replay from a rollout directory.
 *
 * Usage:
 *   npx tsx scripts/replay.ts <rollout-dir> [output.html]
 *
 * Discovers dom_N.json / diag_N.json / out_N.html in the rollout directory,
 * builds DebugSnapshot[] using syntheticIRFromDOM(), and writes the debug HTML.
 *
 * If output.html is omitted, defaults to <rollout-dir>/replay.html.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  readJSON,
  writeFile,
  generateDebugHTML,
  syntheticIRFromDOM,
} from "../dist/index.js";
import type {
  DebugSnapshot,
  InputElement,
  DOMDocument,
  DiagDocument,
} from "../dist/index.js";

// ── Parse args ──
const args = process.argv.slice(2);
const rolloutDir = args[0];

if (!rolloutDir) {
  console.error(`Usage: ${process.argv[1]} <rollout-dir> [output.html]`);
  console.error("");
  console.error("Generates a visual debug HTML replay from rollout artifacts.");
  process.exit(2);
}

if (!fs.existsSync(rolloutDir)) {
  console.error(`Error: rollout directory not found: ${rolloutDir}`);
  process.exit(2);
}

const outputPath = args[1] ?? path.join(rolloutDir, "replay.html");

// ── Discover iterations ──
// Glob dom_*.json to find iteration numbers
const domFiles = fs.readdirSync(rolloutDir)
  .filter((f) => /^dom_\d+\.json$/.test(f))
  .sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)![0], 10);
    const numB = parseInt(b.match(/\d+/)![0], 10);
    return numA - numB;
  });

if (domFiles.length === 0) {
  console.error(`Error: no dom_N.json files found in ${rolloutDir}`);
  process.exit(2);
}

const iterations = domFiles.map((f) => parseInt(f.match(/\d+/)![0], 10));
console.error(`Found ${iterations.length} iteration(s): ${iterations.join(", ")}`);

// ── Load artifacts ──
async function main() {
  // Optionally load input.json for element metadata
  const inputPath = path.join(rolloutDir!, "input.json");
  let inputElements: InputElement[] | undefined;
  if (fs.existsSync(inputPath)) {
    const inputData = await readJSON<{ elements?: InputElement[] }>(inputPath);
    inputElements = inputData.elements;
    console.error(`Loaded input.json with ${inputElements?.length ?? 0} elements`);
  }

  const snapshots: DebugSnapshot[] = [];

  for (const iter of iterations) {
    const domPath = path.join(rolloutDir!, `dom_${iter}.json`);
    const diagPath = path.join(rolloutDir!, `diag_${iter}.json`);
    const htmlPath = path.join(rolloutDir!, `out_${iter}.html`);

    // DOM is required
    const dom = await readJSON<DOMDocument>(domPath);

    // Diag is required
    if (!fs.existsSync(diagPath)) {
      console.error(`Warning: diag_${iter}.json not found, skipping iteration ${iter}`);
      continue;
    }
    const diag = await readJSON<DiagDocument>(diagPath);

    // Build synthetic IR from DOM + input metadata
    const ir = syntheticIRFromDOM(dom, inputElements);

    // Raw HTML is optional — if present, embed it instead of re-rendering from IR
    let rawHTML: string | undefined;
    if (fs.existsSync(htmlPath)) {
      rawHTML = fs.readFileSync(path.resolve(htmlPath), "utf-8");
    }

    snapshots.push({ iter, ir, dom, diag, rawHTML });
  }

  if (snapshots.length === 0) {
    console.error("Error: no valid iterations found");
    process.exit(2);
  }

  // Generate debug HTML
  const html = generateDebugHTML(snapshots);
  await writeFile(outputPath!, html);
  console.error(`Wrote replay HTML to ${outputPath}`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(2);
});
