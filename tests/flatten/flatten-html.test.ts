import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Browser, Page } from "playwright";
import { launchBrowser } from "../../src/utils/browser.js";
import { flattenHTML } from "../../src/flatten/flatten-html.js";

describe("flattenHTML", () => {
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

  it("converts absolute-positioned HTML (identity case)", async () => {
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  * { margin: 0; padding: 0; }
  body { background: #fff; }
  #slide { position: relative; width: 1280px; height: 720px; overflow: hidden; font-family: Arial; }
</style></head><body><div id="slide">
  <div data-eid="e_title" style="position: absolute; left: 40px; top: 28px; width: 800px; height: 72px; z-index: 10; font-size: 42px; font-weight: bold; color: #1e293b;">Hello World</div>
</div></body></html>`;

    const result = await flattenHTML(page, html);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].eid).toBe("e_title");
    expect(result.elements[0].bbox.x).toBe(40);
    expect(result.elements[0].bbox.y).toBe(28);
    expect(result.elements[0].bbox.w).toBe(800);
    expect(result.elements[0].bbox.h).toBe(72);
    expect(result.html).toContain('data-eid="e_title"');
    expect(result.html).toContain("position: absolute");
  });

  it("flattens flexbox layout to absolute positions", async () => {
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  * { margin: 0; padding: 0; }
  body { background: #fff; }
  #slide {
    position: relative; width: 1280px; height: 720px; overflow: hidden;
    font-family: Arial;
    display: flex; flex-direction: column; padding: 40px;
  }
</style></head><body><div id="slide">
  <div data-eid="e_title" style="font-size: 42px; font-weight: bold; margin-bottom: 20px;">Title</div>
  <div data-eid="e_body" style="font-size: 18px; flex: 1;">Body content here</div>
</div></body></html>`;

    const result = await flattenHTML(page, html);
    expect(result.elements).toHaveLength(2);

    const title = result.elements.find((e) => e.eid === "e_title")!;
    const body = result.elements.find((e) => e.eid === "e_body")!;

    // Title should be at top, body below
    expect(title.bbox.y).toBeLessThan(body.bbox.y);
    // Both should have positive positions (inside slide)
    expect(title.bbox.x).toBeGreaterThanOrEqual(0);
    expect(body.bbox.x).toBeGreaterThanOrEqual(0);

    // Output HTML should use absolute positioning
    expect(result.html).toContain("position: absolute");
    expect(result.html).not.toContain("display: flex");
  });

  it("preserves innerHTML content including nested elements", async () => {
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  * { margin: 0; padding: 0; }
  #slide { position: relative; width: 1280px; height: 720px; font-family: Arial; }
</style></head><body><div id="slide">
  <div data-eid="e_bullets" style="position: absolute; left: 40px; top: 100px; width: 600px; height: 300px; font-size: 18px;">
    <ul style="padding-left: 1.5em;"><li>Item 1</li><li>Item 2</li></ul>
  </div>
</div></body></html>`;

    const result = await flattenHTML(page, html);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0].innerHTML).toContain("<li>");
    expect(result.html).toContain("<li>");
  });

  it("extracts computed styles correctly", async () => {
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  * { margin: 0; padding: 0; }
  #slide { position: relative; width: 1280px; height: 720px; font-family: Arial; }
</style></head><body><div id="slide">
  <div data-eid="e_box" style="position: absolute; left: 0; top: 0; width: 100px; height: 100px; background-color: #2563eb; opacity: 0.8; border-radius: 8px; z-index: 5;"></div>
</div></body></html>`;

    const result = await flattenHTML(page, html);
    const el = result.elements[0];
    expect(el.computed.opacity).toBeCloseTo(0.8, 1);
    expect(el.computed.zIndex).toBe(5);
    // Background color should be present in output
    expect(result.html).toContain("background-color:");
    expect(result.html).toContain("border-radius:");
  });

  it("handles multiple elements with different z-indices", async () => {
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  * { margin: 0; padding: 0; }
  #slide { position: relative; width: 1280px; height: 720px; font-family: Arial; }
</style></head><body><div id="slide">
  <div data-eid="e_bg" style="position: absolute; left: 0; top: 0; width: 1280px; height: 720px; z-index: 0; background-color: #fafafa;"></div>
  <div data-eid="e_content" style="position: absolute; left: 40px; top: 40px; width: 400px; height: 200px; z-index: 10; font-size: 18px;">Content</div>
  <div data-eid="e_overlay" style="position: absolute; left: 40px; top: 40px; width: 400px; height: 200px; z-index: 20; font-size: 18px; background-color: rgba(0,0,0,0.5);">Overlay</div>
</div></body></html>`;

    const result = await flattenHTML(page, html);
    expect(result.elements).toHaveLength(3);
    const bg = result.elements.find((e) => e.eid === "e_bg")!;
    const content = result.elements.find((e) => e.eid === "e_content")!;
    const overlay = result.elements.find((e) => e.eid === "e_overlay")!;
    expect(bg.computed.zIndex).toBe(0);
    expect(content.computed.zIndex).toBe(10);
    expect(overlay.computed.zIndex).toBe(20);
  });
});
