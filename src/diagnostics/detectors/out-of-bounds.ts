import type { DOMElement } from "../../schema/dom.js";
import type { Defect, OutOfBoundsDetails, Hint } from "../../schema/diag.js";
import { OOB_EPS_PX, SLIDE_W, SLIDE_H } from "../../constants.js";
import { oobEdges } from "../../utils/geometry.js";

/**
 * Detect out-of-bounds: bbox exceeds slide bounds beyond OOB_EPS_PX.
 * Returns one defect per violated edge.
 */
export function detectOutOfBounds(el: DOMElement): Defect[] {
  const edges = oobEdges(el.bbox, OOB_EPS_PX, SLIDE_W, SLIDE_H);
  const defects: Defect[] = [];

  for (const { edge, by_px } of edges) {
    const details: OutOfBoundsDetails = {
      edge,
      by_px: Math.round(by_px),
    };

    const severity = Math.round(by_px);

    const hint: Hint = {
      action: "move_in",
      validated: true,
      reason: `move element within slide bounds (${edge} by ${Math.round(by_px)}px)`,
    };

    // Compute suggested position/size adjustments
    switch (edge) {
      case "left":
        hint.suggested_x = 0;
        break;
      case "top":
        hint.suggested_y = 0;
        break;
      case "right":
        // Try moving first, then shrinking if needed
        if (el.bbox.w <= SLIDE_W) {
          hint.suggested_x = SLIDE_W - el.bbox.w;
        } else {
          hint.suggested_x = 0;
          hint.suggested_w = SLIDE_W;
        }
        break;
      case "bottom":
        if (el.bbox.h <= SLIDE_H) {
          hint.suggested_y = SLIDE_H - el.bbox.h;
        } else {
          hint.suggested_y = 0;
          hint.suggested_h = SLIDE_H;
        }
        break;
    }

    defects.push({
      type: "out_of_bounds",
      eid: el.eid,
      severity,
      details,
      hint,
    });
  }

  return defects;
}
