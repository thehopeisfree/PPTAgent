import type { DOMElement } from "../../schema/dom.js";
import type { IRElement } from "../../schema/ir.js";
import type { Defect, ContentUnderflowDetails, Hint } from "../../schema/diag.js";
import { UNDERFLOW_RATIO, HINT_BUFFER_PX, TEXT_TYPES } from "../../constants.js";

/**
 * Detect content underflow: container height far exceeds content height.
 * Only applies to text element types (title/text/bullets).
 * Triggers when bbox.h > contentBox.h * UNDERFLOW_RATIO (strict >).
 */
export function detectContentUnderflow(
  el: DOMElement,
  irEl: IRElement,
): Defect | null {
  if (!TEXT_TYPES.has(irEl.type)) return null;
  if (!el.contentBox) return null;
  if (el.contentBox.h <= 0) return null;

  const ratio = el.bbox.h / el.contentBox.h;
  if (ratio <= UNDERFLOW_RATIO) return null;

  const underflowPx = el.bbox.h - el.contentBox.h;

  const details: ContentUnderflowDetails = {
    underflow_y_px: Math.round(underflowPx),
    ratio: Math.round(ratio * 100) / 100,
  };

  const suggestedH = Math.ceil(el.contentBox.h + HINT_BUFFER_PX);

  const hint: Hint = {
    action: "shrink_container",
    validated: true,
    reason: `contentBox.h(${Math.round(el.contentBox.h)}) + HINT_BUFFER_PX(${HINT_BUFFER_PX})`,
    suggested_h: suggestedH,
  };

  return {
    type: "content_underflow",
    eid: el.eid,
    severity: Math.round(underflowPx),
    details,
    hint,
  };
}
