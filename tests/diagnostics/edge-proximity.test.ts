import { describe, it, expect } from "vitest";
import { detectEdgeProximity } from "../../src/diagnostics/detectors/edge-proximity.js";
import type { DOMElement } from "../../src/schema/dom.js";
import type { IRElement } from "../../src/schema/ir.js";

function makeDom(bbox: { x: number; y: number; w: number; h: number }): DOMElement {
  return {
    eid: "e1",
    bbox,
    safeBox: { x: bbox.x - 8, y: bbox.y - 8, w: bbox.w + 16, h: bbox.h + 16 },
    contentBox: null,
    zIndex: 10,
    computed: { fontSize: 20, lineHeight: 1.5 },
  };
}

function makeIr(
  type: "title" | "text" | "image" | "decoration" | "bullets" = "image",
): IRElement {
  return {
    eid: "e1",
    type,
    priority: 60,
    content: "",
    layout: { x: 0, y: 0, w: 100, h: 100, zIndex: 10 },
    style: {},
  };
}

describe("edge_proximity detector", () => {
  it("detects right edge flush with slide boundary (distance=0, severity=24)", () => {
    // x=780, w=500 → right edge = 1280, distance = 0
    const defects = detectEdgeProximity(
      makeDom({ x: 780, y: 100, w: 500, h: 200 }),
      makeIr(),
    );
    const right = defects.find(
      (d) => (d.details as { edge: string }).edge === "right",
    );
    expect(right).toBeDefined();
    expect(right!.severity).toBe(24);
    expect((right!.details as { distance_px: number }).distance_px).toBe(0);
    expect(right!.hint!.action).toBe("nudge_from_edge");
    expect(right!.hint!.suggested_x).toBe(1280 - 24 - 500); // 756
  });

  it("detects element with 10px margin (severity=14)", () => {
    // x=10, w=200 → left distance = 10
    const defects = detectEdgeProximity(
      makeDom({ x: 10, y: 100, w: 200, h: 100 }),
      makeIr(),
    );
    const left = defects.find(
      (d) => (d.details as { edge: string }).edge === "left",
    );
    expect(left).toBeDefined();
    expect(left!.severity).toBe(14);
    expect(left!.hint!.suggested_x).toBe(24);
  });

  it("returns no defect for element with 30px margin", () => {
    // x=30, w=200 → left distance = 30, right distance = 1280-230 = 1050
    // y=30, h=100 → top distance = 30, bottom distance = 720-130 = 590
    const defects = detectEdgeProximity(
      makeDom({ x: 30, y: 30, w: 200, h: 100 }),
      makeIr(),
    );
    expect(defects).toHaveLength(0);
  });

  it("skips decoration elements", () => {
    const defects = detectEdgeProximity(
      makeDom({ x: 0, y: 0, w: 500, h: 200 }),
      makeIr("decoration"),
    );
    expect(defects).toHaveLength(0);
  });

  it("skips edges where element is OOB (distance < 0)", () => {
    // x=-20 → left distance = -20 (OOB, handled by out_of_bounds)
    const defects = detectEdgeProximity(
      makeDom({ x: -20, y: 100, w: 200, h: 100 }),
      makeIr(),
    );
    const left = defects.find(
      (d) => (d.details as { edge: string }).edge === "left",
    );
    expect(left).toBeUndefined();
  });

  it("skips edge when element is too wide for margins on both sides", () => {
    // w = 1280 - 2*24 + 1 = 1233, wider than the max inner width
    // This element can't fit with margins on both sides
    const defects = detectEdgeProximity(
      makeDom({ x: 0, y: 100, w: 1233, h: 100 }),
      makeIr(),
    );
    const leftOrRight = defects.filter(
      (d) => {
        const edge = (d.details as { edge: string }).edge;
        return edge === "left" || edge === "right";
      },
    );
    expect(leftOrRight).toHaveLength(0);
  });

  it("detects multiple edges at once", () => {
    // Top-left corner: x=5, y=5, small element
    const defects = detectEdgeProximity(
      makeDom({ x: 5, y: 5, w: 100, h: 100 }),
      makeIr(),
    );
    const edges = defects.map((d) => (d.details as { edge: string }).edge);
    expect(edges).toContain("left");
    expect(edges).toContain("top");
  });

  it("provides correct hint for bottom edge proximity", () => {
    // y=520, h=200 → bottom edge at 720, distance=0
    const defects = detectEdgeProximity(
      makeDom({ x: 100, y: 520, w: 200, h: 200 }),
      makeIr(),
    );
    const bottom = defects.find(
      (d) => (d.details as { edge: string }).edge === "bottom",
    );
    expect(bottom).toBeDefined();
    expect(bottom!.hint!.suggested_y).toBe(720 - 24 - 200); // 496
  });
});
