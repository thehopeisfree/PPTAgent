import type { DOMElement } from "../../schema/dom.js";
import type { IRElement } from "../../schema/ir.js";
import type { WhitespaceExcessWarning } from "../../schema/diag.js";
import { SLIDE_W, SLIDE_H, WHITESPACE_COVERAGE_MIN } from "../../constants.js";

/**
 * Detect whitespace excess: overall slide has very low element coverage.
 * Only non-decoration element areas count toward coverage.
 * Returns a warning (not a defect) when coverage < WHITESPACE_COVERAGE_MIN.
 */
export function detectWhitespaceExcess(
  domElements: DOMElement[],
  irElements: IRElement[],
): WhitespaceExcessWarning[] {
  const irMap = new Map<string, IRElement>();
  for (const el of irElements) {
    irMap.set(el.eid, el);
  }

  let totalElementArea = 0;
  for (const domEl of domElements) {
    const irEl = irMap.get(domEl.eid);
    if (!irEl || irEl.type === "decoration") continue;
    totalElementArea += domEl.bbox.w * domEl.bbox.h;
  }

  const slideArea = SLIDE_W * SLIDE_H;
  const coverage = totalElementArea / slideArea;

  if (coverage >= WHITESPACE_COVERAGE_MIN) return [];

  return [
    {
      type: "whitespace_excess",
      details: {
        coverage_pct: Math.round(coverage * 10000) / 100, // e.g. 0.123 → 12.3
        threshold_pct: WHITESPACE_COVERAGE_MIN * 100,
        element_area_px: Math.round(totalElementArea),
        slide_area_px: slideArea,
      },
    },
  ];
}
