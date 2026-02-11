import type { DOMElement } from "../../schema/dom.js";
import type { IRElement } from "../../schema/ir.js";
import type { Defect, FontTooSmallDetails, Hint } from "../../schema/diag.js";
import { MIN_FONT_BY_PRIORITY } from "../../constants.js";

/**
 * Detect font_too_small: computed fontSize is below the minimum for the element's priority tier.
 */
export function detectFontTooSmall(
  domEl: DOMElement,
  irEl: IRElement
): Defect | null {
  // Only applies to text-bearing elements
  if (irEl.type === "image" || irEl.type === "decoration") return null;

  const minFont = getMinFontForPriority(irEl.priority);
  if (minFont == null) return null;

  const currentSize = domEl.computed.fontSize;
  if (currentSize >= minFont) return null;

  const details: FontTooSmallDetails = {
    current: Math.round(currentSize),
    min: minFont,
  };

  const severity = Math.round((minFont - currentSize) * 10);

  const hint: Hint = {
    action: "set_fontSize",
    suggested_fontSize: minFont,
    validated: true,
    reason: `minimum fontSize for priority ${irEl.priority} is ${minFont}px`,
  };

  return {
    type: "font_too_small",
    eid: domEl.eid,
    severity,
    details,
    hint,
  };
}

function getMinFontForPriority(priority: number): number | undefined {
  // Check tiers from highest to lowest
  for (const [tierPriority, minFont] of MIN_FONT_BY_PRIORITY) {
    if (priority >= tierPriority) return minFont;
  }
  return undefined;
}
