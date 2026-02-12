import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Browser, Page } from "playwright";
import { launchBrowser } from "../../src/utils/browser.js";
import { htmlToPptx, htmlToPptxBuffer } from "../../src/pptx/html-to-pptx.js";

describe("htmlToPptx", () => {
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

  const makeSlideHtml = (elements: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  * { margin: 0; padding: 0; }
  body { background: #fff; }
  #slide { position: relative; width: 1280px; height: 720px; overflow: hidden; font-family: Arial; }
</style></head><body><div id="slide">
${elements}
</div></body></html>`;

  it("converts a text element to PPTX", async () => {
    const html = makeSlideHtml(
      '<div data-eid="e_title" style="position: absolute; left: 40px; top: 28px; width: 800px; height: 72px; z-index: 10; font-size: 42px; font-weight: bold; color: #1e293b;">Hello World</div>'
    );

    const pres = (await htmlToPptx(page, html)) as any;
    expect(pres).toBeDefined();
    // PptxGenJS presentation should have slides
    expect(pres.slides || pres._slides).toBeDefined();
  });

  it("converts a decoration element to a shape", async () => {
    const html = makeSlideHtml(
      '<div data-eid="e_bg" style="position: absolute; left: 0; top: 0; width: 1280px; height: 720px; z-index: 0; background-color: #fafafa;"></div>'
    );

    const pres = (await htmlToPptx(page, html)) as any;
    expect(pres).toBeDefined();
  });

  it("handles bullet list elements", async () => {
    const html = makeSlideHtml(
      '<div data-eid="e_bullets" style="position: absolute; left: 40px; top: 100px; width: 600px; height: 300px; z-index: 10; font-size: 18px; color: #334155;"><ul style="margin: 0; padding-left: 1.5em;"><li>First item</li><li>Second item</li><li>Third item</li></ul></div>'
    );

    const pres = (await htmlToPptx(page, html)) as any;
    expect(pres).toBeDefined();
  });

  it("handles image elements with remote URLs as placeholders", async () => {
    const html = makeSlideHtml(
      '<div data-eid="e_photo" style="position: absolute; left: 660px; top: 160px; width: 280px; height: 200px; z-index: 10;"><img src="https://example.com/photo.jpg" style="width: 100%; height: 100%; object-fit: contain" alt="" /></div>'
    );

    // Should not throw even with unreachable URL
    const pres = (await htmlToPptx(page, html)) as any;
    expect(pres).toBeDefined();
  });

  it("produces a valid PPTX buffer", async () => {
    const html = makeSlideHtml(
      '<div data-eid="e_title" style="position: absolute; left: 40px; top: 28px; width: 800px; height: 72px; z-index: 10; font-size: 42px; font-weight: bold;">Simple Slide</div>'
    );

    const buffer = await htmlToPptxBuffer(page, html);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // PPTX files are ZIP archives — magic bytes PK (0x50 0x4B)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("handles a complex slide with multiple element types", async () => {
    const html = makeSlideHtml(`
      <div data-eid="e_bg" style="position: absolute; left: 0; top: 0; width: 1280px; height: 720px; z-index: 0; background-color: #fafafa;"></div>
      <div data-eid="e_title" style="position: absolute; left: 40px; top: 28px; width: 800px; height: 72px; z-index: 10; font-size: 42px; font-weight: bold; color: #1e293b;">Team Performance</div>
      <div data-eid="e_subtitle" style="position: absolute; left: 40px; top: 110px; width: 600px; height: 36px; z-index: 10; font-size: 18px; color: #64748b;">Quarterly Review</div>
      <div data-eid="e_metrics" style="position: absolute; left: 40px; top: 170px; width: 560px; height: 300px; z-index: 10; font-size: 16px; color: #334155;"><ul style="margin: 0; padding-left: 1.5em;"><li>Revenue up 15%</li><li>Costs down 8%</li></ul></div>
      <div data-eid="e_photo" style="position: absolute; left: 660px; top: 160px; width: 280px; height: 200px; z-index: 10;"><img src="https://example.com/team.jpg" style="width: 100%; height: 100%; object-fit: contain" alt="" /></div>
    `);

    const buffer = await htmlToPptxBuffer(page, html);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // ZIP magic bytes
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});
