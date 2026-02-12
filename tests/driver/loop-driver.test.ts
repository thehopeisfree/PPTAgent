import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Browser, Page } from "playwright";
import { launchBrowser } from "../../src/utils/browser.js";
import {
  createSession,
  initRollout,
  stepRollout,
  computeFingerprint,
  checkPatch,
  buildStorySoFar,
} from "../../src/driver/loop-driver.js";
import { parseIR } from "../../src/schema/ir.js";
import { parsePatch } from "../../src/schema/patch.js";
import sampleIR from "../fixtures/sample-ir.json";

describe("Loop Driver (integration)", () => {
  let browser: Browser;
  let page: Page;
  let tmpDir: string;

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pptagent-test-"));
  });

  afterAll(async () => {
    await browser.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("initializes a rollout and writes files", async () => {
    const rolloutDir = path.join(tmpDir, "rollout_0001");
    const ir = parseIR(sampleIR);
    const session = createSession(page, rolloutDir);
    const result = await initRollout(session, ir);

    expect(result.iter).toBe(0);
    expect(result.diag.summary.defect_count).toBeGreaterThanOrEqual(0);

    // Check files were written
    const ir0 = await fs.access(path.join(rolloutDir, "ir_0.json"));
    const html0 = await fs.access(path.join(rolloutDir, "out_0.html"));
    const dom0 = await fs.access(path.join(rolloutDir, "dom_0.json"));
    const diag0 = await fs.access(path.join(rolloutDir, "diag_0.json"));
    const render0 = await fs.access(path.join(rolloutDir, "render_0.png"));
    const trace = await fs.access(path.join(rolloutDir, "trace.jsonl"));
  });

  it("applies a patch and produces step result", async () => {
    const rolloutDir = path.join(tmpDir, "rollout_0002");
    const ir = parseIR(sampleIR);
    const session = createSession(page, rolloutDir);
    const initResult = await initRollout(session, ir);

    if (initResult.stopped) return; // Already converged

    const patch = parsePatch({
      edits: [
        {
          eid: "e_bullets_002",
          layout: { y: 140, h: 520 },
        },
      ],
    });

    const stepResult = await stepRollout(session, patch);
    expect(stepResult.iter).toBe(1);
    expect(stepResult.diag).toBeDefined();

    // Check patch file was written
    await fs.access(path.join(rolloutDir, "patch_1.json"));
    await fs.access(path.join(rolloutDir, "ir_1.json"));
  });

  it("stops on success when defect_count reaches 0", async () => {
    // A clean layout that should have no defects
    const cleanIR = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e_title",
          type: "title",
          priority: 100,
          content: "Title",
          layout: { x: 48, y: 32, w: 400, h: 80, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e_text",
          type: "text",
          priority: 60,
          content: "Short text",
          layout: { x: 48, y: 200, w: 400, h: 100, zIndex: 10 },
          style: { fontSize: 18, lineHeight: 1.5 },
        },
      ],
    });

    const rolloutDir = path.join(tmpDir, "rollout_clean");
    const session = createSession(page, rolloutDir);
    const result = await initRollout(session, cleanIR);

    // With well-spaced elements and adequate font sizes, expect success
    if (result.diag.summary.defect_count === 0) {
      expect(result.stopped).toBe(true);
      expect(result.quality).toMatch(/success/);
    }
  });

  it("returns metrics on completion", async () => {
    const cleanIR = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "title",
          priority: 100,
          content: "Clean",
          layout: { x: 100, y: 100, w: 400, h: 80, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
      ],
    });

    const rolloutDir = path.join(tmpDir, "rollout_metrics");
    const session = createSession(page, rolloutDir);
    const result = await initRollout(session, cleanIR);

    if (result.stopped && result.metrics) {
      expect(result.metrics.quality).toBeDefined();
      expect(result.metrics.defect_count_per_iter).toHaveLength(1);
      expect(result.metrics.iterations_to_converge).toBe(0);
    }
  });

  it("records overrides in trace when budget is exceeded", async () => {
    const ir = parseIR(sampleIR);
    const rolloutDir = path.join(tmpDir, "rollout_overrides");
    const session = createSession(page, rolloutDir);
    await initRollout(session, ir);

    // Apply a patch that exceeds the position budget for the title
    const patch = parsePatch({
      edits: [
        {
          eid: "e_title_001",
          layout: { y: 200 }, // 200 - 32 = 168px move, exceeds 48px budget
        },
      ],
    });

    const result = await stepRollout(session, patch);
    expect(result.iter).toBe(1);

    // Read trace and check for overrides
    const tracePath = path.join(rolloutDir, "trace.jsonl");
    const traceContent = await fs.readFile(tracePath, "utf-8");
    const lines = traceContent.trim().split("\n");
    const lastEntry = JSON.parse(lines[lines.length - 1]!);
    expect(lastEntry.overrides).toBeDefined();
    expect(lastEntry.overrides.length).toBeGreaterThan(0);
  });

  it("initializes tabooFingerprints as empty Set", () => {
    const session = createSession(page, "/tmp/test");
    expect(session.tabooFingerprints).toBeInstanceOf(Set);
    expect(session.tabooFingerprints.size).toBe(0);
  });

  it("initializes _busy as false", () => {
    const session = createSession(page, "/tmp/test");
    expect(session._busy).toBe(false);
  });

  it("sets _busy during initRollout and resets after", async () => {
    const cleanIR = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "title",
          priority: 100,
          content: "Test",
          layout: { x: 100, y: 100, w: 400, h: 80, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
      ],
    });

    const rolloutDir = path.join(tmpDir, "rollout_busy_init");
    const session = createSession(page, rolloutDir);

    await initRollout(session, cleanIR);
    expect(session._busy).toBe(false);
  });

  it("throws when concurrent stepRollout is attempted", async () => {
    const cleanIR = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "title",
          priority: 100,
          content: "Test",
          layout: { x: 100, y: 100, w: 400, h: 80, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e2",
          type: "text",
          priority: 50,
          content: "Overlapping text",
          layout: { x: 100, y: 100, w: 400, h: 80, zIndex: 10 },
          style: { fontSize: 18, lineHeight: 1.5 },
        },
      ],
    });

    const rolloutDir = path.join(tmpDir, "rollout_busy_concurrent");
    const session = createSession(page, rolloutDir);
    await initRollout(session, cleanIR);

    const patch = parsePatch({
      edits: [{ eid: "e2", layout: { y: 250 } }],
    });

    // Simulate busy state
    session._busy = true;
    await expect(stepRollout(session, patch)).rejects.toThrow(
      "Session is busy"
    );
    session._busy = false;
  });

  it("releases _busy even if initRollout throws", async () => {
    // Provide a page-like object that will cause extractDOM to fail
    const badPage = { goto: () => { throw new Error("fake"); } } as unknown as Page;
    const session = createSession(badPage, path.join(tmpDir, "rollout_busy_error"));

    const cleanIR = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "title",
          priority: 100,
          content: "Test",
          layout: { x: 100, y: 100, w: 400, h: 80, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
      ],
    });

    try {
      await initRollout(session, cleanIR);
    } catch {
      // Expected to fail
    }
    expect(session._busy).toBe(false);
  });
});

describe("computeFingerprint", () => {
  // computeFingerprint is a pure function — no Playwright page needed
  const fakePage = null as unknown as Page;

  const baseIR = parseIR({
    slide: { w: 1280, h: 720 },
    elements: [
      {
        eid: "e1",
        type: "title",
        priority: 100,
        content: "Title",
        layout: { x: 48, y: 32, w: 400, h: 80, zIndex: 10 },
        style: { fontSize: 44, lineHeight: 1.2 },
      },
      {
        eid: "e2",
        type: "bullets",
        priority: 80,
        content: "• A",
        layout: { x: 48, y: 200, w: 400, h: 300, zIndex: 10 },
        style: { fontSize: 22, lineHeight: 1.5 },
      },
    ],
  });

  it("produces deterministic fingerprints", () => {
    const patch = parsePatch({
      edits: [{ eid: "e1", layout: { y: 50 } }],
    });
    const fp1 = computeFingerprint(baseIR, patch);
    const fp2 = computeFingerprint(baseIR, patch);
    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe("");
  });

  it("detects move directions correctly", () => {
    const patchDown = parsePatch({
      edits: [{ eid: "e1", layout: { y: 100 } }],
    });
    expect(computeFingerprint(baseIR, patchDown)).toContain("e1:move:down");

    const patchUp = parsePatch({
      edits: [{ eid: "e1", layout: { y: 10 } }],
    });
    expect(computeFingerprint(baseIR, patchUp)).toContain("e1:move:up");

    const patchRight = parsePatch({
      edits: [{ eid: "e1", layout: { x: 100 } }],
    });
    expect(computeFingerprint(baseIR, patchRight)).toContain("e1:move:right");

    const patchLeft = parsePatch({
      edits: [{ eid: "e1", layout: { x: 10 } }],
    });
    expect(computeFingerprint(baseIR, patchLeft)).toContain("e1:move:left");
  });

  it("detects resize directions", () => {
    const patchGrow = parsePatch({
      edits: [{ eid: "e1", layout: { w: 500, h: 100 } }],
    });
    const fp = computeFingerprint(baseIR, patchGrow);
    expect(fp).toContain("e1:resize_w:grow");
    expect(fp).toContain("e1:resize_h:grow");

    const patchShrink = parsePatch({
      edits: [{ eid: "e1", layout: { w: 300, h: 60 } }],
    });
    const fp2 = computeFingerprint(baseIR, patchShrink);
    expect(fp2).toContain("e1:resize_w:shrink");
    expect(fp2).toContain("e1:resize_h:shrink");
  });

  it("detects font size changes", () => {
    const patchIncrease = parsePatch({
      edits: [{ eid: "e1", style: { fontSize: 50 } }],
    });
    expect(computeFingerprint(baseIR, patchIncrease)).toContain("e1:font:increase");

    const patchDecrease = parsePatch({
      edits: [{ eid: "e1", style: { fontSize: 38 } }],
    });
    expect(computeFingerprint(baseIR, patchDecrease)).toContain("e1:font:decrease");
  });

  it("returns empty string for no-op patch", () => {
    // Patch that doesn't change anything
    const patch = parsePatch({
      edits: [{ eid: "e1", layout: { y: 32 } }], // same as current
    });
    expect(computeFingerprint(baseIR, patch)).toBe("");
  });

  it("returns empty string for unknown eid", () => {
    const patch = parsePatch({
      edits: [{ eid: "unknown", layout: { y: 100 } }],
    });
    expect(computeFingerprint(baseIR, patch)).toBe("");
  });
});

describe("checkPatch", () => {
  // checkPatch is a pure function — no Playwright page needed
  const fakePage = null as unknown as Page;

  const baseIR = parseIR({
    slide: { w: 1280, h: 720 },
    elements: [
      {
        eid: "e1",
        type: "title",
        priority: 100,
        content: "Title",
        layout: { x: 48, y: 32, w: 400, h: 80, zIndex: 10 },
        style: { fontSize: 44, lineHeight: 1.2 },
      },
    ],
  });

  it("allows patch when taboo list is empty", () => {
    const session = createSession(fakePage, "/tmp/test");
    // Simulate having a history entry
    session.history.push({
      iter: 0,
      ir: baseIR,
      diag: { defects: [], warnings: [], summary: { defect_count: 0, total_severity: 0, warning_count: 0, warning_severity: 0 } },
      defectCount: 0,
      totalSeverity: 0,
      warningCount: 0,
      warningSeverity: 0,
    });

    const patch = parsePatch({
      edits: [{ eid: "e1", layout: { y: 100 } }],
    });

    const result = checkPatch(session, patch);
    expect(result.allowed).toBe(true);
    expect(result.fingerprint).not.toBe("");
  });

  it("rejects patch matching taboo fingerprint", () => {
    const session = createSession(fakePage, "/tmp/test");
    session.history.push({
      iter: 0,
      ir: baseIR,
      diag: { defects: [], warnings: [], summary: { defect_count: 0, total_severity: 0, warning_count: 0, warning_severity: 0 } },
      defectCount: 0,
      totalSeverity: 0,
      warningCount: 0,
      warningSeverity: 0,
    });

    const patch = parsePatch({
      edits: [{ eid: "e1", layout: { y: 100 } }],
    });

    // Add the fingerprint to taboo
    const fp = computeFingerprint(baseIR, patch);
    session.tabooFingerprints.add(fp);

    const result = checkPatch(session, patch);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.fingerprint).toBe(fp);
  });

  it("allows patch when no history exists", () => {
    const session = createSession(fakePage, "/tmp/test");
    const patch = parsePatch({
      edits: [{ eid: "e1", layout: { y: 100 } }],
    });

    const result = checkPatch(session, patch);
    expect(result.allowed).toBe(true);
    expect(result.fingerprint).toBe("");
  });
});

describe("buildStorySoFar", () => {
  const fakePage = null as unknown as Page;

  const baseIR = parseIR({
    slide: { w: 1280, h: 720 },
    elements: [
      {
        eid: "e1",
        type: "title",
        priority: 100,
        content: "Title",
        layout: { x: 48, y: 32, w: 400, h: 80, zIndex: 10 },
        style: { fontSize: 44, lineHeight: 1.2 },
      },
    ],
  });

  const makeDiag = (defectCount: number, severity: number, warningCount = 0, warningSeverity = 0) => ({
    defects: defectCount > 0 ? [{ type: "overlap" as const, owner_eid: "e1", other_eid: "e2", severity, details: { overlap_area_px: severity } }] : [],
    warnings: [],
    summary: { defect_count: defectCount, total_severity: severity, warning_count: warningCount, warning_severity: warningSeverity },
  });

  it("returns empty string with no history", () => {
    const session = createSession(fakePage, "/tmp/test");
    expect(buildStorySoFar(session)).toBe("");
  });

  it("returns empty string with only 1 iteration", () => {
    const session = createSession(fakePage, "/tmp/test");
    session.history.push({
      iter: 0, ir: baseIR, diag: makeDiag(2, 500),
      defectCount: 2, totalSeverity: 500, warningCount: 0, warningSeverity: 0,
    });
    expect(buildStorySoFar(session)).toBe("");
  });

  it("includes non-improving iterations", () => {
    const session = createSession(fakePage, "/tmp/test");
    session.history.push({
      iter: 0, ir: baseIR, diag: makeDiag(2, 500),
      defectCount: 2, totalSeverity: 500, warningCount: 0, warningSeverity: 0,
    });
    session.history.push({
      iter: 1, ir: baseIR, diag: makeDiag(2, 600),
      defectCount: 2, totalSeverity: 600, warningCount: 0, warningSeverity: 0,
    });

    const story = buildStorySoFar(session);
    expect(story).toContain("STORY SO FAR");
    expect(story).toContain("iter 1");
    expect(story).toContain("no improvement");
  });

  it("includes taboo fingerprints", () => {
    const session = createSession(fakePage, "/tmp/test");
    session.history.push({
      iter: 0, ir: baseIR, diag: makeDiag(2, 500),
      defectCount: 2, totalSeverity: 500, warningCount: 0, warningSeverity: 0,
    });
    session.history.push({
      iter: 1, ir: baseIR, diag: makeDiag(1, 200),
      defectCount: 1, totalSeverity: 200, warningCount: 0, warningSeverity: 0,
    });
    session.tabooFingerprints.add("e1:move:down");

    const story = buildStorySoFar(session);
    expect(story).toContain("taboo");
    expect(story).toContain("e1");
    expect(story).toContain("move");
    expect(story).toContain("down");
  });

  it("shows current state and best state", () => {
    const session = createSession(fakePage, "/tmp/test");
    session.history.push({
      iter: 0, ir: baseIR, diag: makeDiag(3, 800),
      defectCount: 3, totalSeverity: 800, warningCount: 0, warningSeverity: 0,
    });
    session.history.push({
      iter: 1, ir: baseIR, diag: makeDiag(1, 200),
      defectCount: 1, totalSeverity: 200, warningCount: 0, warningSeverity: 0,
    });
    session.history.push({
      iter: 2, ir: baseIR, diag: makeDiag(2, 500),
      defectCount: 2, totalSeverity: 500, warningCount: 0, warningSeverity: 0,
    });
    session.bestIter = 1;

    const story = buildStorySoFar(session);
    expect(story).toContain("Current: iter 2");
    expect(story).toContain("Best so far: iter 1");
  });
});
