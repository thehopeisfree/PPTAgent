import { describe, it, expect } from "vitest";
import { renderHTML } from "../../src/renderer/html-renderer.js";
import { parseIR } from "../../src/schema/ir.js";
import sampleIR from "../fixtures/sample-ir.json";

describe("HTML Renderer", () => {
  it("produces valid HTML with #slide container", () => {
    const ir = parseIR(sampleIR);
    const html = renderHTML(ir);
    expect(html).toContain('<div id="slide">');
    expect(html).toContain("width: 1280px");
    expect(html).toContain("height: 720px");
  });

  it("embeds data-eid attributes", () => {
    const ir = parseIR(sampleIR);
    const html = renderHTML(ir);
    expect(html).toContain('data-eid="e_bg_001"');
    expect(html).toContain('data-eid="e_title_001"');
    expect(html).toContain('data-eid="e_bullets_002"');
  });

  it("renders bullet content as <ul><li>", () => {
    const ir = parseIR(sampleIR);
    const html = renderHTML(ir);
    expect(html).toContain("<ul");
    expect(html).toContain("<li>Point A</li>");
    expect(html).toContain("<li>Point B</li>");
    expect(html).toContain("<li>Point C</li>");
  });

  it("renders images with <img> tag", () => {
    const ir = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e_img",
          type: "image",
          priority: 40,
          content: "photo.jpg",
          layout: { x: 100, y: 100, w: 400, h: 300, zIndex: 10 },
          style: {},
        },
      ],
    });
    const html = renderHTML(ir);
    expect(html).toContain('<img src="photo.jpg"');
    expect(html).toContain("object-fit: contain");
  });

  it("applies absolute positioning and overflow: visible", () => {
    const ir = parseIR(sampleIR);
    const html = renderHTML(ir);
    expect(html).toContain("position: absolute");
    expect(html).toContain("overflow: visible");
  });

  it("applies fontSize and lineHeight from style", () => {
    const ir = parseIR(sampleIR);
    const html = renderHTML(ir);
    expect(html).toContain("font-size: 44px");
    expect(html).toContain("line-height: 1.2");
  });

  it("escapes HTML in text content", () => {
    const ir = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "text",
          priority: 60,
          content: '<script>alert("xss")</script>',
          layout: { x: 0, y: 0, w: 200, h: 50, zIndex: 10 },
          style: {},
        },
      ],
    });
    const html = renderHTML(ir);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders decoration elements as styled divs", () => {
    const ir = parseIR(sampleIR);
    const html = renderHTML(ir);
    // The decoration element with bg color
    expect(html).toContain("background-color: #f0f0f0");
  });
});
