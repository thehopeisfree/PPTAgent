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

  it("move_down target accounts for both elements' safe padding", () => {
    // Regression: move_down used to subtract only 1×SAFE_PADDING instead of
    // adding 2×SAFE_PADDING, producing a target that still overlapped.
    // Exact scenario from the sim: title at y=28 h=50, subtitle at y=90 h=23.
    const SAFE_PADDING = 8;
    const owner: DOMElement = {
      eid: "e_subtitle",
      bbox: { x: 40, y: 90, w: 1200, h: 23 },
      safeBox: { x: 32, y: 82, w: 1216, h: 39 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 18, lineHeight: 1.3 },
    };
    const other: DOMElement = {
      eid: "e_title",
      bbox: { x: 40, y: 28, w: 1200, h: 50 },
      safeBox: { x: 32, y: 20, w: 1216, h: 66 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 42, lineHeight: 1.2 },
    };

    const options = computeSeparationOptions(owner, other);
    const down = options.find((o) => o.direction === "move_down")!;

    // target must clear other's bbox bottom (78) + 2×SAFE_PADDING (16) = 94
    const expected = other.bbox.y + other.bbox.h + SAFE_PADDING * 2; // 94
    expect(down.target_y).toBe(expected);

    // Placing owner at target_y must NOT overlap:
    // owner safeBox top = target_y - SAFE_PADDING = 86
    // other safeBox bottom = other.bbox.y + other.bbox.h + SAFE_PADDING = 86
    // 86 >= 86 → no overlap
    expect(down.target_y! - SAFE_PADDING).toBeGreaterThanOrEqual(
      other.bbox.y + other.bbox.h + SAFE_PADDING
    );
  });

  it("move_right target accounts for both elements' safe padding", () => {
    const SAFE_PADDING = 8;
    const owner: DOMElement = {
      eid: "e_right",
      bbox: { x: 180, y: 100, w: 200, h: 100 },
      safeBox: { x: 172, y: 92, w: 216, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.4 },
    };
    const other: DOMElement = {
      eid: "e_left",
      bbox: { x: 50, y: 100, w: 150, h: 100 },
      safeBox: { x: 42, y: 92, w: 166, h: 116 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.4 },
    };

    const options = computeSeparationOptions(owner, other);
    const right = options.find((o) => o.direction === "move_right")!;

    const expected = other.bbox.x + other.bbox.w + SAFE_PADDING * 2; // 216
    expect(right.target_x).toBe(expected);

    // owner safeBox left = target_x - SAFE_PADDING = 208
    // other safeBox right = 50 + 150 + 8 = 208
    // 208 >= 208 → no overlap
    expect(right.target_x! - SAFE_PADDING).toBeGreaterThanOrEqual(
      other.bbox.x + other.bbox.w + SAFE_PADDING
    );
  });

  it("all four directions are symmetric: target clears both safe boxes", () => {
    const SAFE_PADDING = 8;
    const owner: DOMElement = {
      eid: "owner",
      bbox: { x: 100, y: 100, w: 200, h: 80 },
      safeBox: { x: 92, y: 92, w: 216, h: 96 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.4 },
    };
    const other: DOMElement = {
      eid: "other",
      bbox: { x: 120, y: 80, w: 160, h: 60 },
      safeBox: { x: 112, y: 72, w: 176, h: 76 },
      contentBox: null,
      zIndex: 10,
      computed: { fontSize: 16, lineHeight: 1.4 },
    };

    const options = computeSeparationOptions(owner, other);
    const down = options.find((o) => o.direction === "move_down")!;
    const up = options.find((o) => o.direction === "move_up")!;
    const right = options.find((o) => o.direction === "move_right")!;
    const left = options.find((o) => o.direction === "move_left")!;

    // move_down: owner safeBox top clears other safeBox bottom
    expect(down.target_y! - SAFE_PADDING).toBeGreaterThanOrEqual(
      other.bbox.y + other.bbox.h + SAFE_PADDING
    );
    // move_up: owner safeBox bottom clears other safeBox top
    expect(up.target_y! + owner.bbox.h + SAFE_PADDING).toBeLessThanOrEqual(
      other.bbox.y - SAFE_PADDING
    );
    // move_right: owner safeBox left clears other safeBox right
    expect(right.target_x! - SAFE_PADDING).toBeGreaterThanOrEqual(
      other.bbox.x + other.bbox.w + SAFE_PADDING
    );
    // move_left: owner safeBox right clears other safeBox left
    expect(left.target_x! + owner.bbox.w + SAFE_PADDING).toBeLessThanOrEqual(
      other.bbox.x - SAFE_PADDING
    );
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
