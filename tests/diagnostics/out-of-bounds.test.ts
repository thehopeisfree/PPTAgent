import { describe, it, expect } from "vitest";
import { detectOutOfBounds } from "../../src/diagnostics/detectors/out-of-bounds.js";
import type { DOMElement } from "../../src/schema/dom.js";

describe("out_of_bounds detector", () => {
  it("detects right edge overflow", () => {
    const el: DOMElement = {
      eid: "e1",
      bbox: { x: 1200, y: 0, w: 200, h: 100 },
      safeBox: { x: 1192, y: -8, w: 216, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    const defects = detectOutOfBounds(el);
    expect(defects).toHaveLength(1);
    expect(defects[0]!.details).toEqual({ edge: "right", by_px: 120 });
  });

  it("detects bottom edge overflow", () => {
    const el: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 650, w: 100, h: 200 },
      safeBox: { x: -8, y: 642, w: 116, h: 216 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    const defects = detectOutOfBounds(el);
    expect(defects.length).toBeGreaterThanOrEqual(1);
    const bottomDefect = defects.find(
      (d) => (d.details as { edge: string }).edge === "bottom"
    );
    expect(bottomDefect).toBeDefined();
  });

  it("detects left edge overflow", () => {
    const el: DOMElement = {
      eid: "e1",
      bbox: { x: -20, y: 0, w: 100, h: 100 },
      safeBox: { x: -28, y: -8, w: 116, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    const defects = detectOutOfBounds(el);
    expect(defects.length).toBeGreaterThanOrEqual(1);
    const leftDefect = defects.find(
      (d) => (d.details as { edge: string }).edge === "left"
    );
    expect(leftDefect).toBeDefined();
  });

  it("detects top edge overflow", () => {
    const el: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: -30, w: 100, h: 100 },
      safeBox: { x: -8, y: -38, w: 116, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    const defects = detectOutOfBounds(el);
    expect(defects.length).toBeGreaterThanOrEqual(1);
    const topDefect = defects.find(
      (d) => (d.details as { edge: string }).edge === "top"
    );
    expect(topDefect).toBeDefined();
  });

  it("returns empty for in-bounds element", () => {
    const el: DOMElement = {
      eid: "e1",
      bbox: { x: 100, y: 100, w: 200, h: 200 },
      safeBox: { x: 92, y: 92, w: 216, h: 216 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    expect(detectOutOfBounds(el)).toHaveLength(0);
  });

  it("respects OOB_EPS_PX tolerance", () => {
    // Just barely over by < 1px — should be within tolerance
    const el: DOMElement = {
      eid: "e1",
      bbox: { x: 0, y: 0, w: 1280.5, h: 720 },
      safeBox: { x: -8, y: -8, w: 1296.5, h: 736 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    expect(detectOutOfBounds(el)).toHaveLength(0);
  });

  it("provides suggested position hints", () => {
    const el: DOMElement = {
      eid: "e1",
      bbox: { x: 1200, y: 0, w: 200, h: 100 },
      safeBox: { x: 1192, y: -8, w: 216, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.5 },
    };
    const defects = detectOutOfBounds(el);
    expect(defects[0]!.hint).toBeDefined();
    expect(defects[0]!.hint!.suggested_x).toBe(1080); // 1280 - 200
  });
});
