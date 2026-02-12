import { describe, it, expect } from "vitest";
import { detectWhitespaceExcess } from "../../src/diagnostics/detectors/whitespace-excess.js";
import type { DOMElement } from "../../src/schema/dom.js";
import type { IRElement } from "../../src/schema/ir.js";

function makeDomEl(
  eid: string,
  bbox: { x: number; y: number; w: number; h: number },
): DOMElement {
  return {
    eid,
    bbox,
    safeBox: { x: bbox.x - 8, y: bbox.y - 8, w: bbox.w + 16, h: bbox.h + 16 },
    contentBox: null,
    zIndex: 10,
    computed: { fontSize: 20, lineHeight: 1.5 },
  };
}

function makeIrEl(
  eid: string,
  type: "title" | "text" | "bullets" | "image" | "decoration" = "text",
): IRElement {
  return {
    eid,
    type,
    priority: 60,
    content: "",
    layout: { x: 0, y: 0, w: 100, h: 100, zIndex: 10 },
    style: {},
  };
}

describe("whitespace_excess detector", () => {
  it("warns when single small element covers ~1% of slide", () => {
    // 100×100 = 10,000 / 921,600 ≈ 1.1%
    const warnings = detectWhitespaceExcess(
      [makeDomEl("e1", { x: 0, y: 0, w: 100, h: 100 })],
      [makeIrEl("e1")],
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.type).toBe("whitespace_excess");
    expect(warnings[0]!.details.coverage_pct).toBeLessThan(30);
    expect(warnings[0]!.details.threshold_pct).toBe(30);
    expect(warnings[0]!.details.slide_area_px).toBe(1280 * 720);
  });

  it("returns no warning when element covers >30% of slide", () => {
    // 800×400 = 320,000 / 921,600 ≈ 34.7%
    const warnings = detectWhitespaceExcess(
      [makeDomEl("e1", { x: 0, y: 0, w: 800, h: 400 })],
      [makeIrEl("e1")],
    );
    expect(warnings).toHaveLength(0);
  });

  it("excludes decoration elements from coverage calculation", () => {
    // Decoration covers entire slide but should not count
    const warnings = detectWhitespaceExcess(
      [makeDomEl("deco", { x: 0, y: 0, w: 1280, h: 720 })],
      [makeIrEl("deco", "decoration")],
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.details.element_area_px).toBe(0);
  });

  it("warns based on non-decoration area when decoration + small content", () => {
    // Decoration covers slide, but small content element covers 1%
    const warnings = detectWhitespaceExcess(
      [
        makeDomEl("deco", { x: 0, y: 0, w: 1280, h: 720 }),
        makeDomEl("e1", { x: 50, y: 50, w: 100, h: 100 }),
      ],
      [
        makeIrEl("deco", "decoration"),
        makeIrEl("e1"),
      ],
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.details.coverage_pct).toBeLessThan(30);
  });

  it("returns no warning for empty element list", () => {
    const warnings = detectWhitespaceExcess([], []);
    expect(warnings).toHaveLength(1); // 0 coverage → warning
    expect(warnings[0]!.details.element_area_px).toBe(0);
  });

  it("sums multiple element areas for coverage", () => {
    // Two elements: 400×400 each = 320,000 total / 921,600 ≈ 34.7%
    const warnings = detectWhitespaceExcess(
      [
        makeDomEl("e1", { x: 0, y: 0, w: 400, h: 400 }),
        makeDomEl("e2", { x: 500, y: 0, w: 400, h: 400 }),
      ],
      [makeIrEl("e1"), makeIrEl("e2")],
    );
    expect(warnings).toHaveLength(0);
  });
});
