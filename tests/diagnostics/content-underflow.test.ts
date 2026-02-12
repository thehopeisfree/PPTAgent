import { describe, it, expect } from "vitest";
import { detectContentUnderflow } from "../../src/diagnostics/detectors/content-underflow.js";
import type { DOMElement } from "../../src/schema/dom.js";
import type { IRElement } from "../../src/schema/ir.js";
import { HINT_BUFFER_PX } from "../../src/constants.js";

function makeDom(
  bboxH: number,
  contentBoxH: number | null,
): DOMElement {
  return {
    eid: "e1",
    bbox: { x: 48, y: 32, w: 400, h: bboxH },
    safeBox: { x: 40, y: 24, w: 416, h: bboxH + 16 },
    contentBox: contentBoxH !== null
      ? { x: 48, y: 34, w: 300, h: contentBoxH }
      : null,
    zIndex: 10,
    computed: { fontSize: 20, lineHeight: 1.5 },
  };
}

function makeIr(
  type: "title" | "text" | "bullets" | "image" | "decoration" = "text",
): IRElement {
  return {
    eid: "e1",
    type,
    priority: 60,
    content: "Sample text",
    layout: { x: 48, y: 32, w: 400, h: 300, zIndex: 10 },
    style: { fontSize: 20, lineHeight: 1.5 },
  };
}

describe("content_underflow detector", () => {
  it("detects underflow when bbox.h=300, contentBox.h=100 (ratio=3)", () => {
    const defect = detectContentUnderflow(makeDom(300, 100), makeIr());
    expect(defect).not.toBeNull();
    expect(defect!.type).toBe("content_underflow");
    expect(defect!.severity).toBe(200); // 300 - 100
    expect(defect!.eid).toBe("e1");
    const details = defect!.details as { underflow_y_px: number; ratio: number };
    expect(details.underflow_y_px).toBe(200);
    expect(details.ratio).toBe(3);
  });

  it("returns no defect when bbox.h=200, contentBox.h=150 (ratio=1.33)", () => {
    const defect = detectContentUnderflow(makeDom(200, 150), makeIr());
    expect(defect).toBeNull();
  });

  it("returns no defect at exact threshold (bbox.h=200, contentBox.h=100, ratio=2)", () => {
    const defect = detectContentUnderflow(makeDom(200, 100), makeIr());
    expect(defect).toBeNull(); // strict > not >=
  });

  it("skips image elements", () => {
    const defect = detectContentUnderflow(makeDom(300, 100), makeIr("image"));
    expect(defect).toBeNull();
  });

  it("skips decoration elements", () => {
    const defect = detectContentUnderflow(makeDom(300, 100), makeIr("decoration"));
    expect(defect).toBeNull();
  });

  it("skips when contentBox is null", () => {
    const defect = detectContentUnderflow(makeDom(300, null), makeIr());
    expect(defect).toBeNull();
  });

  it("skips when contentBox.h is 0", () => {
    const defect = detectContentUnderflow(makeDom(300, 0), makeIr());
    expect(defect).toBeNull();
  });

  it("provides correct hint with suggested_h = contentBox.h + HINT_BUFFER_PX", () => {
    const defect = detectContentUnderflow(makeDom(300, 100), makeIr());
    expect(defect).not.toBeNull();
    expect(defect!.hint).toBeDefined();
    expect(defect!.hint!.action).toBe("shrink_container");
    expect(defect!.hint!.suggested_h).toBe(Math.ceil(100 + HINT_BUFFER_PX));
    expect(defect!.hint!.validated).toBe(true);
  });

  it("works for title elements", () => {
    const defect = detectContentUnderflow(makeDom(300, 100), makeIr("title"));
    expect(defect).not.toBeNull();
    expect(defect!.type).toBe("content_underflow");
  });

  it("works for bullets elements", () => {
    const defect = detectContentUnderflow(makeDom(300, 100), makeIr("bullets"));
    expect(defect).not.toBeNull();
    expect(defect!.type).toBe("content_underflow");
  });
});
