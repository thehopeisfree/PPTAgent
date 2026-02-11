import { describe, it, expect } from "vitest";
import { detectContentOverflow } from "../../src/diagnostics/detectors/content-overflow.js";
import type { DOMElement } from "../../src/schema/dom.js";

describe("content_overflow detector", () => {
  it("detects vertical overflow", () => {
    const el: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 0, w: 400, h: 200 },
      safeBox: { x: -8, y: -8, w: 416, h: 216 },
      contentBox: { x: 0, y: 0, w: 390, h: 250 },
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    const defect = detectContentOverflow(el);
    expect(defect).not.toBeNull();
    expect(defect!.type).toBe("content_overflow");
    expect(defect!.severity).toBe(50);
    expect(defect!.hint!.suggested_h).toBe(258); // 250 + 8 buffer
  });

  it("detects horizontal overflow", () => {
    const el: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 0, w: 200, h: 100 },
      safeBox: { x: -8, y: -8, w: 216, h: 116 },
      contentBox: { x: 0, y: 0, w: 250, h: 90 },
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    const defect = detectContentOverflow(el);
    expect(defect).not.toBeNull();
    expect(defect!.hint!.suggested_w).toBe(258); // 250 + 8 buffer
    expect(defect!.hint!.action).toBe("resize_width");
  });

  it("returns null when no overflow", () => {
    const el: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 0, w: 400, h: 200 },
      safeBox: { x: -8, y: -8, w: 416, h: 216 },
      contentBox: { x: 0, y: 0, w: 300, h: 150 },
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    expect(detectContentOverflow(el)).toBeNull();
  });

  it("returns null when contentBox is null", () => {
    const el: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 0, w: 400, h: 200 },
      safeBox: { x: -8, y: -8, w: 416, h: 216 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    expect(detectContentOverflow(el)).toBeNull();
  });

  it("reports both overflow dimensions", () => {
    const el: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 0, w: 200, h: 100 },
      safeBox: { x: -8, y: -8, w: 216, h: 116 },
      contentBox: { x: 0, y: 0, w: 250, h: 150 },
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    const defect = detectContentOverflow(el);
    expect(defect!.hint!.action).toBe("resize_both");
    expect(defect!.hint!.suggested_w).toBeDefined();
    expect(defect!.hint!.suggested_h).toBeDefined();
  });
});
