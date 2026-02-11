import { describe, it, expect } from "vitest";
import {
  inflateRect,
  intersectRects,
  intersectionArea,
  clampToSlide,
  oobEdges,
  isInBounds,
  unionRects,
  rectArea,
} from "../../src/utils/geometry.js";

describe("geometry utilities", () => {
  describe("inflateRect", () => {
    it("inflates by given padding", () => {
      const r = inflateRect({ x: 100, y: 100, w: 200, h: 100 }, 8);
      expect(r).toEqual({ x: 92, y: 92, w: 216, h: 116 });
    });

    it("uses default SAFE_PADDING", () => {
      const r = inflateRect({ x: 50, y: 50, w: 100, h: 100 });
      expect(r).toEqual({ x: 42, y: 42, w: 116, h: 116 });
    });
  });

  describe("intersectRects", () => {
    it("computes intersection of overlapping rects", () => {
      const inter = intersectRects(
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 50, y: 50, w: 100, h: 100 }
      );
      expect(inter).toEqual({ x: 50, y: 50, w: 50, h: 50 });
    });

    it("returns null for non-overlapping rects", () => {
      const inter = intersectRects(
        { x: 0, y: 0, w: 50, h: 50 },
        { x: 100, y: 100, w: 50, h: 50 }
      );
      expect(inter).toBeNull();
    });

    it("returns null for edge-touching rects", () => {
      const inter = intersectRects(
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 100, y: 0, w: 100, h: 100 }
      );
      expect(inter).toBeNull();
    });
  });

  describe("intersectionArea", () => {
    it("computes area of overlap", () => {
      const area = intersectionArea(
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 50, y: 50, w: 100, h: 100 }
      );
      expect(area).toBe(2500);
    });

    it("returns 0 for non-overlapping", () => {
      const area = intersectionArea(
        { x: 0, y: 0, w: 50, h: 50 },
        { x: 100, y: 100, w: 50, h: 50 }
      );
      expect(area).toBe(0);
    });
  });

  describe("clampToSlide", () => {
    it("clamps position to keep rect in bounds", () => {
      const r = clampToSlide({ x: -10, y: -20, w: 200, h: 100 });
      expect(r.x).toBe(0);
      expect(r.y).toBe(0);
    });

    it("clamps right/bottom edge", () => {
      const r = clampToSlide({ x: 1200, y: 650, w: 200, h: 200 });
      expect(r.x).toBe(1080); // 1280 - 200
      expect(r.y).toBe(520); // 720 - 200
    });

    it("clamps oversized rects", () => {
      const r = clampToSlide({ x: 0, y: 0, w: 2000, h: 1000 });
      expect(r.w).toBe(1280);
      expect(r.h).toBe(720);
      expect(r.x).toBe(0);
      expect(r.y).toBe(0);
    });
  });

  describe("oobEdges", () => {
    it("detects out-of-bounds edges", () => {
      const edges = oobEdges({ x: -10, y: -5, w: 100, h: 50 }, 1);
      expect(edges).toContainEqual({ edge: "left", by_px: 10 });
      expect(edges).toContainEqual({ edge: "top", by_px: 5 });
    });

    it("returns empty for in-bounds rect", () => {
      const edges = oobEdges({ x: 100, y: 100, w: 200, h: 200 }, 1);
      expect(edges).toHaveLength(0);
    });

    it("respects tolerance", () => {
      // 0.5px over — within 1px tolerance
      const edges = oobEdges({ x: -0.5, y: 0, w: 100, h: 100 }, 1);
      expect(edges).toHaveLength(0);
    });
  });

  describe("isInBounds", () => {
    it("returns true for in-bounds rect", () => {
      expect(isInBounds({ x: 100, y: 100, w: 200, h: 200 })).toBe(true);
    });

    it("returns false for out-of-bounds rect", () => {
      expect(isInBounds({ x: -10, y: 100, w: 200, h: 200 })).toBe(false);
    });
  });

  describe("unionRects", () => {
    it("computes union bounding box", () => {
      const u = unionRects([
        { x: 0, y: 0, w: 100, h: 100 },
        { x: 50, y: 50, w: 100, h: 100 },
      ]);
      expect(u).toEqual({ x: 0, y: 0, w: 150, h: 150 });
    });

    it("returns null for empty array", () => {
      expect(unionRects([])).toBeNull();
    });
  });

  describe("rectArea", () => {
    it("computes area", () => {
      expect(rectArea({ x: 0, y: 0, w: 100, h: 50 })).toBe(5000);
    });
  });
});
