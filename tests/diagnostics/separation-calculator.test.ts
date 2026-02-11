import { describe, it, expect } from "vitest";
import { computeSeparationOptions } from "../../src/diagnostics/hints/separation-calculator.js";
import type { DOMElement } from "../../src/schema/dom.js";

describe("computeSeparationOptions", () => {
  it("returns 4 separation options sorted by cost ascending", () => {
    const owner: DOMElement = {
      eid: "e2",
      bbox: { x: 100, y: 150, w: 400, h: 200 },
      safeBox: { x: 92, y: 142, w: 416, h: 216 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 22, lineHeight: 1.5 },
    };
    const other: DOMElement = {
      eid: "e1",
      bbox: { x: 100, y: 100, w: 400, h: 100 },
      safeBox: { x: 92, y: 92, w: 416, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 44, lineHeight: 1.2 },
    };

    const options = computeSeparationOptions(owner, other);
    expect(options).toHaveLength(4);

    // Verify sorted by cost ascending
    for (let i = 1; i < options.length; i++) {
      expect(options[i]!.cost_px).toBeGreaterThanOrEqual(options[i - 1]!.cost_px);
    }
  });

  it("provides target_y for vertical moves and target_x for horizontal moves", () => {
    const owner: DOMElement = {
      eid: "a",
      bbox: { x: 100, y: 150, w: 200, h: 100 },
      safeBox: { x: 92, y: 142, w: 216, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.4 },
    };
    const other: DOMElement = {
      eid: "b",
      bbox: { x: 100, y: 100, w: 200, h: 80 },
      safeBox: { x: 92, y: 92, w: 216, h: 96 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.4 },
    };

    const options = computeSeparationOptions(owner, other);
    const down = options.find((o) => o.direction === "move_down")!;
    const up = options.find((o) => o.direction === "move_up")!;
    const right = options.find((o) => o.direction === "move_right")!;
    const left = options.find((o) => o.direction === "move_left")!;

    expect(down.target_y).toBeDefined();
    expect(down.target_x).toBeUndefined();
    expect(up.target_y).toBeDefined();
    expect(up.target_x).toBeUndefined();
    expect(right.target_x).toBeDefined();
    expect(right.target_y).toBeUndefined();
    expect(left.target_x).toBeDefined();
    expect(left.target_y).toBeUndefined();
  });

  it("cheapest move is vertical when elements are stacked vertically", () => {
    const owner: DOMElement = {
      eid: "body",
      bbox: { x: 100, y: 130, w: 400, h: 100 },
      safeBox: { x: 92, y: 122, w: 416, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.4 },
    };
    const other: DOMElement = {
      eid: "title",
      bbox: { x: 100, y: 50, w: 400, h: 100 },
      safeBox: { x: 92, y: 42, w: 416, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 36, lineHeight: 1.2 },
    };

    const options = computeSeparationOptions(owner, other);
    // Elements share same X range so horizontal moves are expensive
    // Cheapest should be a vertical move (down or up)
    expect(options[0]!.direction).toMatch(/move_(down|up)/);
  });
});
