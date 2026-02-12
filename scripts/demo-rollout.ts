/**
 * End-to-end rollout demo — simulates an LLM with no prior knowledge.
 *
 * 1. "LLM" generates an initial IR (with intentional layout problems).
 * 2. PPTAgent renders → extracts DOM → runs diagnostics.
 * 3. "LLM" reads diagnostics and generates a patch.
 * 4. Repeat until convergence.
 * All intermediate artifacts are saved to rollouts/demo_walkthrough/.
 */

import {
  createSession,
  initRollout,
  stepRollout,
  launchBrowser,
  readJSON,
} from "../dist/index.js";
import type { IRDocument, PatchDocument } from "../dist/index.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const ROLLOUT_DIR = path.resolve("rollouts/demo_walkthrough");

// ──────────────────────────────────────────────────────────────
// Step 0: "LLM" generates initial layout (with intentional issues)
// ──────────────────────────────────────────────────────────────
//
// Scenario: a presentation slide with:
//   - A background decoration (full slide)
//   - A title flush against the left edge (x=0) → should trigger edge_proximity
//   - Bullet points that overlap with the title slightly
//   - A photo flush with the right edge (x+w=1280) → should trigger edge_proximity
//   - Font on bullets is too small (14px, min is 20 for priority 80)
//
// These problems mimic what a naive LLM might produce.

const initialIR: IRDocument = {
  slide: { w: 1280, h: 720 },
  elements: [
    {
      eid: "e_bg",
      type: "decoration",
      priority: 20,
      content: "",
      layout: { x: 0, y: 0, w: 1280, h: 720, zIndex: 0 },
      style: { backgroundColor: "#f5f5f5" },
    },
    {
      eid: "e_title",
      type: "title",
      priority: 100,
      content: "Quarterly Revenue Report",
      layout: { x: 5, y: 40, w: 700, h: 80, zIndex: 10 },
      style: { fontSize: 44, lineHeight: 1.2, fontWeight: "bold" },
    },
    {
      eid: "e_bullets",
      type: "bullets",
      priority: 80,
      content: "• Revenue grew 23% year-over-year\n• New markets contributed $4.2M\n• Operating margin improved to 18%\n• Customer retention at 94%",
      layout: { x: 5, y: 100, w: 700, h: 250, zIndex: 10 },
      style: { fontSize: 14, lineHeight: 1.5 },
    },
    {
      eid: "e_photo",
      type: "image",
      priority: 40,
      content: "https://placehold.co/500x400/e0e0e0/666?text=Revenue+Chart",
      layout: { x: 780, y: 160, w: 500, h: 400, zIndex: 10 },
      style: {},
    },
  ],
};

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main() {
  // Clean rollout dir
  await fs.rm(ROLLOUT_DIR, { recursive: true, force: true });
  await fs.mkdir(ROLLOUT_DIR, { recursive: true });

  // Save the initial "LLM input" for reference
  await fs.writeFile(
    path.join(ROLLOUT_DIR, "input.json"),
    JSON.stringify(initialIR, null, 2),
  );

  // Launch browser
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  const session = createSession(page, ROLLOUT_DIR);

  console.log("═══════════════════════════════════════════════════");
  console.log("  PPTAgent Rollout Walkthrough — Demo");
  console.log("═══════════════════════════════════════════════════\n");

  // ── Iteration 0: init ──
  console.log("── Iteration 0: Initial Layout ──");
  console.log("LLM generated initial IR with intentional problems:");
  console.log("  - Title at x=5 (left edge proximity, distance=5)");
  console.log("  - Bullets at x=5, y=100 (overlaps title safeBox, font 14px < min 20px)");
  console.log("  - Photo at x=780, w=500 (right edge flush at 1280)\n");

  const step0 = await initRollout(session, initialIR);

  console.log(`  defect_count = ${step0.diag.summary.defect_count}`);
  console.log(`  total_severity = ${step0.diag.summary.total_severity}`);
  console.log(`  warning_count = ${step0.diag.summary.warning_count}`);
  console.log(`  defects:`);
  for (const d of step0.diag.defects) {
    const eid = d.eid ?? d.owner_eid;
    console.log(`    [${d.type}] eid=${eid} severity=${d.severity}`);
    if (d.hint) {
      const hintParts: string[] = [`action=${d.hint.action}`];
      if (d.hint.suggested_x != null) hintParts.push(`suggested_x=${d.hint.suggested_x}`);
      if (d.hint.suggested_y != null) hintParts.push(`suggested_y=${d.hint.suggested_y}`);
      if (d.hint.suggested_w != null) hintParts.push(`suggested_w=${d.hint.suggested_w}`);
      if (d.hint.suggested_h != null) hintParts.push(`suggested_h=${d.hint.suggested_h}`);
      if (d.hint.suggested_fontSize != null) hintParts.push(`suggested_fontSize=${d.hint.suggested_fontSize}`);
      console.log(`      hint: ${hintParts.join(", ")}`);
    }
  }
  console.log(`  stopped = ${step0.stopped}\n`);

  if (step0.stopped) {
    console.log("Rollout complete at iter 0 (no defects found).");
    await browser.close();
    return;
  }

  // ── Iteration 1: LLM reads diagnostics and generates patch ──
  console.log("── Iteration 1: LLM reads diagnostics, generates patch ──");
  console.log('LLM reasoning (simulated):');
  console.log('  "I see multiple defects. Let me follow the fix priority order.');
  console.log('   1. font_too_small on e_bullets: set fontSize to 20');
  console.log('   2. edge_proximity on e_title (left): move x from 5 to 24');
  console.log('   3. edge_proximity on e_bullets (left): move x from 5 to 24');
  console.log('   4. edge_proximity on e_photo (right): hints say suggested_x, apply it');
  console.log('   5. overlap between e_title and e_bullets: move e_bullets y down');
  console.log('   Let me apply all hints from diagnostics."\n');

  // Build patch from diagnostics hints
  const patch1: PatchDocument = {
    edits: [
      {
        eid: "e_title",
        layout: { x: 24 },   // fix left edge proximity
      },
      {
        eid: "e_bullets",
        layout: { x: 24, y: 150 },  // fix left edge proximity + move down to clear title
        style: { fontSize: 20 },     // fix font_too_small (14 -> 20)
      },
      {
        eid: "e_photo",
        layout: { x: 756 },  // fix right edge proximity (1280 - 24 - 500 = 756)
      },
    ],
    constraints: { no_add_remove: true },
  };

  console.log("  Patch 1:");
  for (const edit of patch1.edits) {
    const parts: string[] = [];
    if (edit.layout) parts.push(`layout=${JSON.stringify(edit.layout)}`);
    if (edit.style) parts.push(`style=${JSON.stringify(edit.style)}`);
    console.log(`    ${edit.eid}: ${parts.join(", ")}`);
  }
  console.log();

  const step1 = await stepRollout(session, patch1);

  console.log(`  defect_count = ${step1.diag.summary.defect_count}`);
  console.log(`  total_severity = ${step1.diag.summary.total_severity}`);
  console.log(`  warning_count = ${step1.diag.summary.warning_count}`);
  if (step1.diag.defects.length > 0) {
    console.log(`  remaining defects:`);
    for (const d of step1.diag.defects) {
      const eid = d.eid ?? d.owner_eid;
      console.log(`    [${d.type}] eid=${eid} severity=${d.severity}`);
      if (d.hint) {
        const hintParts: string[] = [`action=${d.hint.action}`];
        if (d.hint.suggested_x != null) hintParts.push(`suggested_x=${d.hint.suggested_x}`);
        if (d.hint.suggested_y != null) hintParts.push(`suggested_y=${d.hint.suggested_y}`);
        if (d.hint.suggested_h != null) hintParts.push(`suggested_h=${d.hint.suggested_h}`);
        if (d.hint.suggested_fontSize != null) hintParts.push(`suggested_fontSize=${d.hint.suggested_fontSize}`);
        console.log(`        hint: ${hintParts.join(", ")}`);
      }
    }
  }
  console.log(`  stopped = ${step1.stopped}\n`);

  if (step1.stopped) {
    console.log(`Rollout complete at iter 1. quality = ${step1.quality}`);
    await printSummary();
    await browser.close();
    return;
  }

  // ── Iteration 2: fix remaining defects if any ──
  console.log("── Iteration 2: LLM reads remaining diagnostics ──");
  console.log('LLM reasoning (simulated):');
  console.log('  "Let me check what defects remain and apply their hints directly."\n');

  // Build patch from remaining hints
  const patch2Edits: PatchDocument["edits"] = [];
  for (const d of step1.diag.defects) {
    if (!d.hint) continue;
    const eid = d.eid ?? d.hint.target_eid ?? d.owner_eid;
    if (!eid) continue;

    const edit: PatchDocument["edits"][number] = { eid };
    const layoutParts: Record<string, number> = {};
    if (d.hint.suggested_x != null) layoutParts.x = d.hint.suggested_x;
    if (d.hint.suggested_y != null) layoutParts.y = d.hint.suggested_y;
    if (d.hint.suggested_w != null) layoutParts.w = d.hint.suggested_w;
    if (d.hint.suggested_h != null) layoutParts.h = d.hint.suggested_h;
    if (Object.keys(layoutParts).length > 0) edit.layout = layoutParts;
    if (d.hint.suggested_fontSize != null) edit.style = { fontSize: d.hint.suggested_fontSize };

    // Deduplicate by eid (merge into existing edit)
    const existing = patch2Edits.find((e) => e.eid === eid);
    if (existing) {
      if (edit.layout) existing.layout = { ...existing.layout, ...edit.layout };
      if (edit.style) existing.style = { ...existing.style, ...edit.style };
    } else {
      patch2Edits.push(edit);
    }
  }

  if (patch2Edits.length === 0) {
    console.log("  No actionable hints remaining. Stopping.");
    await browser.close();
    return;
  }

  const patch2: PatchDocument = {
    edits: patch2Edits,
    constraints: { no_add_remove: true },
  };

  console.log("  Patch 2:");
  for (const edit of patch2.edits) {
    const parts: string[] = [];
    if (edit.layout) parts.push(`layout=${JSON.stringify(edit.layout)}`);
    if (edit.style) parts.push(`style=${JSON.stringify(edit.style)}`);
    console.log(`    ${edit.eid}: ${parts.join(", ")}`);
  }
  console.log();

  const step2 = await stepRollout(session, patch2);

  console.log(`  defect_count = ${step2.diag.summary.defect_count}`);
  console.log(`  total_severity = ${step2.diag.summary.total_severity}`);
  console.log(`  warning_count = ${step2.diag.summary.warning_count}`);
  if (step2.diag.defects.length > 0) {
    console.log(`  remaining defects:`);
    for (const d of step2.diag.defects) {
      const eid = d.eid ?? d.owner_eid;
      console.log(`    [${d.type}] eid=${eid} severity=${d.severity}`);
    }
  }
  console.log(`  stopped = ${step2.stopped}`);
  console.log(`  quality = ${step2.quality ?? "(continuing)"}\n`);

  if (step2.stopped) {
    console.log(`Rollout complete at iter 2. quality = ${step2.quality}`);
  }

  // ── Summary ──
  await printSummary();
  await browser.close();
}

async function printSummary() {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Rollout Artifacts");
  console.log("═══════════════════════════════════════════════════\n");

  const files = await fs.readdir(ROLLOUT_DIR);
  files.sort();
  for (const f of files) {
    const stat = await fs.stat(path.join(ROLLOUT_DIR, f));
    const size = stat.size < 1024
      ? `${stat.size} B`
      : `${(stat.size / 1024).toFixed(1)} KB`;
    console.log(`  ${f.padEnd(24)} ${size}`);
  }

  console.log("\n── trace.jsonl ──");
  const trace = await fs.readFile(path.join(ROLLOUT_DIR, "trace.jsonl"), "utf-8");
  for (const line of trace.trim().split("\n")) {
    const entry = JSON.parse(line);
    console.log(`  iter ${entry.iter}: defects=${entry.defect_count} severity=${entry.total_severity} warnings=${entry.warning_count} action=${entry.action}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
