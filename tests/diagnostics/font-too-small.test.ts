import { describe, it, expect } from "vitest";
import { detectFontTooSmall } from "../../src/diagnostics/detectors/font-too-small.js";
import type { DOMElement } from "../../src/schema/dom.js";
import type { IRElement } from "../../src/schema/ir.js";

describe("font_too_small detector", () => {
  it("detects font below minimum for priority 100", () => {
    const domEl: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 0, w: 400, h: 100 },
      safeBox: { x: -8, y: -8, w: 416, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 28, lineHeight: 1.2 },
    };
    const irEl: IRElement = {
      eid: "e1",
      type: "title",
      priority: 100,
      content: "Title",
      layout: { x: 0, y: 0, w: 400, h: 100, zIndex: 10 },
      style: { fontSize: 28 },
    };

    const defect = detectFontTooSmall(domEl, irEl);
    expect(defect).not.toBeNull();
    expect(defect!.type).toBe("font_too_small");
    expect(defect!.severity).toBe((32 - 28) * 10); // 40
    expect(defect!.hint!.suggested_fontSize).toBe(32);
  });

  it("detects font below minimum for priority 80", () => {
    const domEl: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 0, w: 400, h: 100 },
      safeBox: { x: -8, y: -8, w: 416, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    const irEl: IRElement = {
      eid: "e1",
      type: "bullets",
      priority: 80,
      content: "• A",
      layout: { x: 0, y: 0, w: 400, h: 100, zIndex: 10 },
      style: { fontSize: 16 },
    };

    const defect = detectFontTooSmall(domEl, irEl);
    expect(defect).not.toBeNull();
    expect(defect!.hint!.suggested_fontSize).toBe(20);
  });

  it("returns null when font is sufficient", () => {
    const domEl: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 0, w: 400, h: 100 },
      safeBox: { x: -8, y: -8, w: 416, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 44, lineHeight: 1.2 },
    };
    const irEl: IRElement = {
      eid: "e1",
      type: "title",
      priority: 100,
      content: "Title",
      layout: { x: 0, y: 0, w: 400, h: 100, zIndex: 10 },
      style: { fontSize: 44 },
    };

    expect(detectFontTooSmall(domEl, irEl)).toBeNull();
  });

  it("skips image elements", () => {
    const domEl: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 0, w: 400, h: 100 },
      safeBox: { x: -8, y: -8, w: 416, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 0, lineHeight: 1.5 },
    };
    const irEl: IRElement = {
      eid: "e1",
      type: "image",
      priority: 40,
      content: "photo.jpg",
      layout: { x: 0, y: 0, w: 400, h: 100, zIndex: 10 },
      style: {},
    };

    expect(detectFontTooSmall(domEl, irEl)).toBeNull();
  });

  it("skips decoration elements", () => {
    const domEl: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 0, w: 400, h: 100 },
      safeBox: { x: -8, y: -8, w: 416, h: 116 },
      contentBox: null,
      zIndex: 0,
      computed: { fontSize: 10, lineHeight: 1.2 },
    };
    const irEl: IRElement = {
      eid: "e1",
      type: "decoration",
      priority: 20,
      content: "",
      layout: { x: 0, y: 0, w: 400, h: 100, zIndex: 0 },
      style: {},
    };

    expect(detectFontTooSmall(domEl, irEl)).toBeNull();
  });

  it("handles priority without defined minimum", () => {
    const domEl: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 0, w: 400, h: 100 },
      safeBox: { x: -8, y: -8, w: 416, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 8, lineHeight: 1.2 },
    };
    const irEl: IRElement = {
      eid: "e1",
      type: "text",
      priority: 30,
      content: "Caption",
      layout: { x: 0, y: 0, w: 400, h: 100, zIndex: 10 },
      style: { fontSize: 8 },
    };

    // Priority 30 has no defined min font threshold
    expect(detectFontTooSmall(domEl, irEl)).toBeNull();
  });
});
