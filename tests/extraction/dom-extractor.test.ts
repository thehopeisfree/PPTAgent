import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Browser, Page } from "playwright";
import { extractDOM } from "../../src/extraction/dom-extractor.js";
import { launchBrowser } from "../../src/utils/browser.js";
import { renderHTML } from "../../src/renderer/html-renderer.js";
import { parseIR } from "../../src/schema/ir.js";
import sampleIR from "../fixtures/sample-ir.json";

describe("DOM Extractor (integration)", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("extracts all elements with data-eid", async () => {
    const ir = parseIR(sampleIR);
    const html = renderHTML(ir);
    const dom = await extractDOM(page, html);

    expect(dom.elements).toHaveLength(3);
    const eids = dom.elements.map((e) => e.eid);
    expect(eids).toContain("e_bg_001");
    expect(eids).toContain("e_title_001");
    expect(eids).toContain("e_bullets_002");
  });

  it("produces slide-local coordinates", async () => {
    const ir = parseIR(sampleIR);
    const html = renderHTML(ir);
    const dom = await extractDOM(page, html);

    const title = dom.elements.find((e) => e.eid === "e_title_001")!;
    // Title should be at approximately (48, 32)
    expect(title.bbox.x).toBeCloseTo(48, 0);
    expect(title.bbox.y).toBeCloseTo(32, 0);
  });

  it("computes safeBox as inflated bbox", async () => {
    const ir = parseIR(sampleIR);
    const html = renderHTML(ir);
    const dom = await extractDOM(page, html);

    const title = dom.elements.find((e) => e.eid === "e_title_001")!;
    expect(title.safeBox.x).toBeCloseTo(title.bbox.x - 8, 0);
    expect(title.safeBox.y).toBeCloseTo(title.bbox.y - 8, 0);
    expect(title.safeBox.w).toBeCloseTo(title.bbox.w + 16, 0);
    expect(title.safeBox.h).toBeCloseTo(title.bbox.h + 16, 0);
  });

  it("extracts contentBox via Range API", async () => {
    const ir = parseIR(sampleIR);
    const html = renderHTML(ir);
    const dom = await extractDOM(page, html);

    const title = dom.elements.find((e) => e.eid === "e_title_001")!;
    expect(title.contentBox).not.toBeNull();
    // Content should fit within the bbox (no overflow for short text in large container)
    expect(title.contentBox!.w).toBeLessThanOrEqual(title.bbox.w + 1);
  });

  it("extracts computed fontSize", async () => {
    const ir = parseIR(sampleIR);
    const html = renderHTML(ir);
    const dom = await extractDOM(page, html);

    const title = dom.elements.find((e) => e.eid === "e_title_001")!;
    expect(title.computed.fontSize).toBe(44);
  });

  it("extracts zIndex", async () => {
    const ir = parseIR(sampleIR);
    const html = renderHTML(ir);
    const dom = await extractDOM(page, html);

    const bg = dom.elements.find((e) => e.eid === "e_bg_001")!;
    const title = dom.elements.find((e) => e.eid === "e_title_001")!;
    expect(bg.zIndex).toBe(0);
    expect(title.zIndex).toBe(10);
  });

  it("detects content overflow via contentBox", async () => {
    // Use bullets type which renders as <ul><li> — generates real block elements
    // that will overflow a small container
    const ir = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e_overflow",
          type: "bullets",
          priority: 80,
          content:
            "• Line 1\n• Line 2\n• Line 3\n• Line 4\n• Line 5\n• Line 6\n• Line 7\n• Line 8\n• Line 9\n• Line 10\n• Line 11\n• Line 12",
          layout: { x: 48, y: 48, w: 400, h: 80, zIndex: 10 },
          style: { fontSize: 20, lineHeight: 1.5 },
        },
      ],
    });
    const html = renderHTML(ir);
    const dom = await extractDOM(page, html);

    const el = dom.elements.find((e) => e.eid === "e_overflow")!;
    expect(el.contentBox).not.toBeNull();
    // 12 bullet items at 30px each (20px * 1.5 line-height) = 360px >> 80px container
    expect(el.contentBox!.h).toBeGreaterThan(el.bbox.h);
  });
});
