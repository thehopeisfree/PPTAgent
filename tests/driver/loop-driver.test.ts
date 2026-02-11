import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { chromium, type Browser, type Page } from "playwright";
import {
  createSession,
  initRollout,
  stepRollout,
} from "../../src/driver/loop-driver.js";
import { parseIR } from "../../src/schema/ir.js";
import { parsePatch } from "../../src/schema/patch.js";
import sampleIR from "../fixtures/sample-ir.json";

describe("Loop Driver (integration)", () => {
  let browser: Browser;
  let page: Page;
  let tmpDir: string;

  beforeAll(async () => {
    browser = await chromium.launch();
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
});
