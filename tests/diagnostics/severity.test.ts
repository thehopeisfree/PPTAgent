import { describe, it, expect } from "vitest";
import { totalSeverity } from "../../src/diagnostics/severity.js";
import type { Defect } from "../../src/schema/diag.js";

describe("totalSeverity", () => {
  it("sums all defect severities", () => {
    const defects: Defect[] = [
      {
        type: "content_overflow",
        eid: "e1",
        severity: 42,
        details: { overflow_x_px: 0, overflow_y_px: 42 },
      },
      {
        type: "overlap",
        owner_eid: "e2",
        other_eid: "e1",
        severity: 3680,
        details: { overlap_area_px: 1840 },
      },
      {
        type: "font_too_small",
        eid: "e2",
        severity: 40,
        details: { current: 16, min: 20 },
      },
      {
        type: "edge_proximity",
        eid: "e3",
        severity: 14,
        details: { edge: "left", distance_px: 10, threshold_px: 24 },
      },
    ];
    expect(totalSeverity(defects)).toBe(42 + 3680 + 40 + 14);
  });

  it("returns 0 for empty defects", () => {
    expect(totalSeverity([])).toBe(0);
  });
});
