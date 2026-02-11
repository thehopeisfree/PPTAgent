import { describe, it, expect } from "vitest";
import { solveChains } from "../../src/diagnostics/hints/chain-solver.js";
import type { DOMElement } from "../../src/schema/dom.js";
import type { IRElement } from "../../src/schema/ir.js";
import type { Defect } from "../../src/schema/diag.js";

describe("Chain Solver", () => {
  it("returns null when no overlap defects", () => {
    const defects: Defect[] = [
      {
        type: "content_overflow",
        eid: "e1",
        severity: 42,
        details: { overflow_x_px: 0, overflow_y_px: 42 },
      },
    ];
    expect(solveChains(defects, [], [])).toBeNull();
  });

  it("builds a chain from overlapping elements", () => {
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

    const result = solveChains(defects, domEls, irEls);
    expect(result).not.toBeNull();
    expect(result!.conflict_chain).toEqual(["e1", "e2"]);
    expect(result!.chain_hints).toHaveLength(2);
    expect(result!.chain_hints[0]!.action).toBe("keep");
    expect(result!.chain_hints[1]!.suggested_y).toBeDefined();
  });

  it("detects infeasible chains when elements don't fit", () => {
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
        bbox: { x: 100, y: 0, w: 400, h: 400 },
        safeBox: { x: 92, y: -8, w: 416, h: 416 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 44, lineHeight: 1.2 },
      },
      {
        eid: "e2",
        bbox: { x: 100, y: 100, w: 400, h: 400 },
        safeBox: { x: 92, y: 92, w: 416, h: 416 },
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
        layout: { x: 100, y: 0, w: 400, h: 400, zIndex: 10 },
        style: { fontSize: 44 },
      },
      {
        eid: "e2",
        type: "bullets",
        priority: 80,
        content: "B",
        layout: { x: 100, y: 100, w: 400, h: 400, zIndex: 10 },
        style: { fontSize: 22 },
      },
    ];

    const result = solveChains(defects, domEls, irEls);
    expect(result).not.toBeNull();
    // e1 takes 400h + 16 padding = 416, e2 needs 400h
    // 416 + 400 = 816 > 720, so e2 gets compressed or flagged infeasible
    expect(result!.chain_hints[1]!.action).toMatch(
      /move_down_and_shrink|needs_creative_solution/
    );
  });

  it("marks feasible chains correctly", () => {
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
        bbox: { x: 100, y: 50, w: 400, h: 80 },
        safeBox: { x: 92, y: 42, w: 416, h: 96 },
        contentBox: null,
        zIndex: 10,
        computed: { fontSize: 44, lineHeight: 1.2 },
      },
      {
        eid: "e2",
        bbox: { x: 100, y: 100, w: 400, h: 200 },
        safeBox: { x: 92, y: 92, w: 416, h: 216 },
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
        layout: { x: 100, y: 50, w: 400, h: 80, zIndex: 10 },
        style: { fontSize: 44 },
      },
      {
        eid: "e2",
        type: "bullets",
        priority: 80,
        content: "B",
        layout: { x: 100, y: 100, w: 400, h: 200, zIndex: 10 },
        style: { fontSize: 22 },
      },
    ];

    const result = solveChains(defects, domEls, irEls);
    expect(result).not.toBeNull();
    // e1 bottom + safe_padding*2 = 50+80+16 = 146
    // e2 at 146 + 200 = 346 < 720 → feasible
    expect(result!.chain_feasible).toBe(true);
  });
});
