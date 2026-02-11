import type { DOMElement } from "../../schema/dom.js";
import type { Defect, ContentOverflowDetails, Hint } from "../../schema/diag.js";
import { HINT_BUFFER_PX } from "../../constants.js";

/**
 * Detect content overflow: contentBox exceeds bbox.
 * Generates suggested_h / suggested_w hints with buffer.
 */
export function detectContentOverflow(el: DOMElement): Defect | null {
  if (!el.contentBox) return null;

  const overflowX = Math.max(0, el.contentBox.w - el.bbox.w);
  const overflowY = Math.max(0, el.contentBox.h - el.bbox.h);

  if (overflowX <= 0 && overflowY <= 0) return null;

  const details: ContentOverflowDetails = {
    overflow_x_px: Math.round(overflowX),
    overflow_y_px: Math.round(overflowY),
  };

  const severity = Math.round(overflowX + overflowY);

  const hint: Hint = {
    action: "resize_height",
    validated: true,
    reason: "",
    suggested_h: undefined,
    suggested_w: undefined,
  };

  if (overflowY > 0) {
    hint.suggested_h = Math.ceil(el.contentBox.h + HINT_BUFFER_PX);
    hint.reason = `contentBox.h(${Math.round(el.contentBox.h)}) + HINT_BUFFER_PX(${HINT_BUFFER_PX})`;
  }
  if (overflowX > 0) {
    hint.action = overflowY > 0 ? "resize_both" : "resize_width";
    hint.suggested_w = Math.ceil(el.contentBox.w + HINT_BUFFER_PX);
    if (hint.reason) {
      hint.reason += `; contentBox.w(${Math.round(el.contentBox.w)}) + HINT_BUFFER_PX(${HINT_BUFFER_PX})`;
    } else {
      hint.reason = `contentBox.w(${Math.round(el.contentBox.w)}) + HINT_BUFFER_PX(${HINT_BUFFER_PX})`;
    }
  }

  return {
    type: "content_overflow",
    eid: el.eid,
    severity,
    details,
    hint,
  };
}
