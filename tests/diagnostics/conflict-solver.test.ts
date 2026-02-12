import { describe, it, expect } from "vitest";
import { analyzeConflicts } from "../../src/diagnostics/hints/conflict-solver.js";
import type { DOMElement } from "../../src/schema/dom.js";
import type { IRElement } from "../../src/schema/ir.js";
import type { Defect } from "../../src/schema/diag.js";

describe("Conflict Solver (analyzeConflicts)", () => {
  it("returns empty array when no overlap defects", () => {
    const defects: Defect[] = [
      {
        type: "content_overflow",
        eid: "e1",
        severity: 42,
        details: { overflow_x_px: 0, overflow_y_px: 42 },
      },
    ];
    expect(analyzeConflicts(defects, [], [])).toEqual([]);
  });

  it("basic pair: one overlap produces 1 component with 1 edge, 4 separations, 2 envelopes", () => {
    const defects: Defect[] = [
      {
        type: "overlap",
        owner_eid: "e2",
        other_eid: "e1",
        severity: 1000,
        details: { overlap_area_px: 500 },
      },
    ];
    const domEls: DOMElement[] = [
      {
        eid: "e1",
        bbox: { x: 100, y: 100, w: 400, h: 100 },
        safeBox: { x: 92, y: 92, w: 416, h: 116 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 44, lineHeight: 1.2 },
      },
      {
        eid: "e2",
        bbox: { x: 100, y: 150, w: 400, h: 200 },
        safeBox: { x: 92, y: 142, w: 416, h: 216 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 22, lineHeight: 1.5 },
      },
    ];
    const irEls: IRElement[] = [
      {
        eid: "e1",
        type: "title",
        priority: 100,
        content: "A",
        layout: { x: 100, y: 100, w: 400, h: 100, zIndex: 10 },
        style: { fontSize: 44 },
      },
      {
        eid: "e2",
        type: "bullets",
        priority: 80,
        content: "B",
        layout: { x: 100, y: 150, w: 400, h: 200, zIndex: 10 },
        style: { fontSize: 22 },
      },
    ];

    const result = analyzeConflicts(defects, domEls, irEls);
    expect(result).toHaveLength(1);
    const comp = result[0]!;
    expect(comp.eids).toHaveLength(2);
    expect(comp.anchor_eid).toBe("e1"); // e1 has priority 100, e2 has 80
    expect(comp.edges).toHaveLength(1);
    expect(comp.edges[0]!.separations).toHaveLength(4);
    expect(comp.envelopes).toHaveLength(2);
  });

  it("separations are sorted by cost ascending", () => {
    const defects: Defect[] = [
      {
        type: "overlap",
        owner_eid: "e2",
        other_eid: "e1",
        severity: 500,
        details: { overlap_area_px: 300 },
      },
    ];
    const domEls: DOMElement[] = [
      {
        eid: "e1",
        bbox: { x: 100, y: 100, w: 400, h: 80 },
        safeBox: { x: 92, y: 92, w: 416, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
      {
        eid: "e2",
        bbox: { x: 100, y: 160, w: 400, h: 80 },
        safeBox: { x: 92, y: 152, w: 416, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
    ];
    const irEls: IRElement[] = [
      { eid: "e1", type: "text", priority: 80, content: "", layout: { x: 100, y: 100, w: 400, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
      { eid: "e2", type: "text", priority: 60, content: "", layout: { x: 100, y: 160, w: 400, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
    ];

    const result = analyzeConflicts(defects, domEls, irEls);
    const seps = result[0]!.edges[0]!.separations;
    for (let i = 1; i < seps.length; i++) {
      expect(seps[i]!.cost_px).toBeGreaterThanOrEqual(seps[i - 1]!.cost_px);
    }
  });

  it("multi-component: A<->B and C<->D (disconnected) produce 2 components", () => {
    const defects: Defect[] = [
      {
        type: "overlap",
        owner_eid: "B",
        other_eid: "A",
        severity: 500,
        details: { overlap_area_px: 300 },
      },
      {
        type: "overlap",
        owner_eid: "D",
        other_eid: "C",
        severity: 500,
        details: { overlap_area_px: 300 },
      },
    ];
    const domEls: DOMElement[] = [
      {
        eid: "A",
        bbox: { x: 50, y: 50, w: 200, h: 80 },
        safeBox: { x: 42, y: 42, w: 216, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
      {
        eid: "B",
        bbox: { x: 50, y: 100, w: 200, h: 80 },
        safeBox: { x: 42, y: 92, w: 216, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
      {
        eid: "C",
        bbox: { x: 700, y: 50, w: 200, h: 80 },
        safeBox: { x: 692, y: 42, w: 216, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
      {
        eid: "D",
        bbox: { x: 700, y: 100, w: 200, h: 80 },
        safeBox: { x: 692, y: 92, w: 216, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
    ];
    const irEls: IRElement[] = [
      { eid: "A", type: "title", priority: 100, content: "A", layout: { x: 50, y: 50, w: 200, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
      { eid: "B", type: "text", priority: 60, content: "B", layout: { x: 50, y: 100, w: 200, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
      { eid: "C", type: "text", priority: 90, content: "C", layout: { x: 700, y: 50, w: 200, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
      { eid: "D", type: "text", priority: 50, content: "D", layout: { x: 700, y: 100, w: 200, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
    ];

    const result = analyzeConflicts(defects, domEls, irEls);
    expect(result).toHaveLength(2);
    // Each component has 2 elements
    expect(result[0]!.eids).toHaveLength(2);
    expect(result[1]!.eids).toHaveLength(2);
    // Components are independent
    const allEids = [...result[0]!.eids, ...result[1]!.eids];
    expect(new Set(allEids).size).toBe(4);
    // Anchor is highest priority in each component
    const comp1 = result.find((c) => c.eids.includes("A"))!;
    const comp2 = result.find((c) => c.eids.includes("C"))!;
    expect(comp1.anchor_eid).toBe("A"); // priority 100
    expect(comp2.anchor_eid).toBe("C"); // priority 90
  });

  it("space envelope boundary: element near slide edge reflects boundary", () => {
    const defects: Defect[] = [
      {
        type: "overlap",
        owner_eid: "e2",
        other_eid: "e1",
        severity: 500,
        details: { overlap_area_px: 300 },
      },
    ];
    // e1 is near top-left corner
    const domEls: DOMElement[] = [
      {
        eid: "e1",
        bbox: { x: 10, y: 10, w: 200, h: 80 },
        safeBox: { x: 2, y: 2, w: 216, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
      {
        eid: "e2",
        bbox: { x: 10, y: 70, w: 200, h: 80 },
        safeBox: { x: 2, y: 62, w: 216, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
    ];
    const irEls: IRElement[] = [
      { eid: "e1", type: "text", priority: 80, content: "", layout: { x: 10, y: 10, w: 200, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
      { eid: "e2", type: "text", priority: 60, content: "", layout: { x: 10, y: 70, w: 200, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
    ];

    const result = analyzeConflicts(defects, domEls, irEls);
    const e1Env = result[0]!.envelopes.find((e) => e.eid === "e1")!;
    // e1's safeBox starts at y=2, so free_top = 2
    expect(e1Env.free_top).toBe(2);
    // e1's safeBox starts at x=2, so free_left = 2
    expect(e1Env.free_left).toBe(2);
  });

  it("decoration exclusion: decoration element does not appear in envelopes or block free space", () => {
    const defects: Defect[] = [
      {
        type: "overlap",
        owner_eid: "e2",
        other_eid: "e1",
        severity: 500,
        details: { overlap_area_px: 300 },
      },
    ];
    // Decoration element covers the whole slide
    const domEls: DOMElement[] = [
      {
        eid: "bg",
        bbox: { x: 0, y: 0, w: 1280, h: 720 },
        safeBox: { x: -8, y: -8, w: 1296, h: 736 },
        contentBox: null,
        zIndex: 0,
        computed: { fontSize: 16, lineHeight: 1 },
      },
      {
        eid: "e1",
        bbox: { x: 100, y: 100, w: 400, h: 80 },
        safeBox: { x: 92, y: 92, w: 416, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
      {
        eid: "e2",
        bbox: { x: 100, y: 160, w: 400, h: 80 },
        safeBox: { x: 92, y: 152, w: 416, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
    ];
    const irEls: IRElement[] = [
      { eid: "bg", type: "decoration", priority: 5, content: "", layout: { x: 0, y: 0, w: 1280, h: 720, zIndex: 0 }, style: {} },
      { eid: "e1", type: "text", priority: 80, content: "", layout: { x: 100, y: 100, w: 400, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
      { eid: "e2", type: "text", priority: 60, content: "", layout: { x: 100, y: 160, w: 400, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
    ];

    const result = analyzeConflicts(defects, domEls, irEls);
    expect(result).toHaveLength(1);
    // Decoration should not appear in envelopes
    const envEids = result[0]!.envelopes.map((e) => e.eid);
    expect(envEids).not.toContain("bg");
    // Decoration should not block free space — e1 should have free_top based on slide edge
    const e1Env = result[0]!.envelopes.find((e) => e.eid === "e1")!;
    expect(e1Env.free_top).toBe(92); // distance to slide top edge
  });

  it("anchor_eid tie-breaks by zIndex then alphabetical", () => {
    const defects: Defect[] = [
      {
        type: "overlap",
        owner_eid: "B",
        other_eid: "A",
        severity: 500,
        details: { overlap_area_px: 300 },
      },
    ];
    // Both same priority, A has lower zIndex
    const domEls: DOMElement[] = [
      {
        eid: "A",
        bbox: { x: 100, y: 100, w: 200, h: 80 },
        safeBox: { x: 92, y: 92, w: 216, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
      {
        eid: "B",
        bbox: { x: 100, y: 150, w: 200, h: 80 },
        safeBox: { x: 92, y: 142, w: 216, h: 96 },
        contentBox: null,
        zIndex: 20,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
    ];
    const irEls: IRElement[] = [
      { eid: "A", type: "text", priority: 80, content: "A", layout: { x: 100, y: 100, w: 200, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
      { eid: "B", type: "text", priority: 80, content: "B", layout: { x: 100, y: 150, w: 200, h: 80, zIndex: 20 }, style: { fontSize: 20 } },
    ];

    const result = analyzeConflicts(defects, domEls, irEls);
    expect(result).toHaveLength(1);
    // Same priority → tie-break by zIndex (B has 20 > A has 10)
    expect(result[0]!.anchor_eid).toBe("B");
  });

  it("anchor_eid tie-breaks alphabetically when priority and zIndex match", () => {
    const defects: Defect[] = [
      {
        type: "overlap",
        owner_eid: "Z_elem",
        other_eid: "A_elem",
        severity: 500,
        details: { overlap_area_px: 300 },
      },
    ];
    const domEls: DOMElement[] = [
      {
        eid: "A_elem",
        bbox: { x: 100, y: 100, w: 200, h: 80 },
        safeBox: { x: 92, y: 92, w: 216, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
      {
        eid: "Z_elem",
        bbox: { x: 100, y: 150, w: 200, h: 80 },
        safeBox: { x: 92, y: 142, w: 216, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 20, lineHeight: 1.4 },
      },
    ];
    const irEls: IRElement[] = [
      { eid: "A_elem", type: "text", priority: 80, content: "A", layout: { x: 100, y: 100, w: 200, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
      { eid: "Z_elem", type: "text", priority: 80, content: "Z", layout: { x: 100, y: 150, w: 200, h: 80, zIndex: 10 }, style: { fontSize: 20 } },
    ];

    const result = analyzeConflicts(defects, domEls, irEls);
    expect(result).toHaveLength(1);
    // Same priority, same zIndex → alphabetically first
    expect(result[0]!.anchor_eid).toBe("A_elem");
  });
});
