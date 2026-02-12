import type { DOMElement } from "../../schema/dom.js";
import type { IRElement } from "../../schema/ir.js";
import type { Defect, EdgeProximityDetails, Hint } from "../../schema/diag.js";
import { EDGE_MARGIN_PX, SLIDE_W, SLIDE_H } from "../../constants.js";

/**
 * Detect elements too close to the slide edge (but not out-of-bounds).
 * Returns one defect per violating edge. Skips decoration elements.
 */
export function detectEdgeProximity(
  el: DOMElement,
  irEl: IRElement,
): Defect[] {
  if (irEl.type === "decoration") return [];

  const defects: Defect[] = [];
  const { x, y, w, h } = el.bbox;
  const maxInnerW = SLIDE_W - 2 * EDGE_MARGIN_PX;
  const maxInnerH = SLIDE_H - 2 * EDGE_MARGIN_PX;

  const edges: Array<{
    edge: "left" | "right" | "top" | "bottom";
    distance: number;
  }> = [
    { edge: "left", distance: x },
    { edge: "right", distance: SLIDE_W - (x + w) },
    { edge: "top", distance: y },
    { edge: "bottom", distance: SLIDE_H - (y + h) },
  ];

  for (const { edge, distance } of edges) {
    // Skip edges already OOB (distance < 0) — handled by out_of_bounds detector
    if (distance < 0) continue;
    // Skip if within acceptable margin
    if (distance >= EDGE_MARGIN_PX) continue;
    // Skip if element is too large to have margins on both sides for this axis
    if ((edge === "left" || edge === "right") && w > maxInnerW) continue;
    if ((edge === "top" || edge === "bottom") && h > maxInnerH) continue;

    const severity = EDGE_MARGIN_PX - distance;

    const details: EdgeProximityDetails = {
      edge,
      distance_px: Math.round(distance),
      threshold_px: EDGE_MARGIN_PX,
    };

    const hint: Hint = {
      action: "nudge_from_edge",
      validated: true,
      reason: `nudge element inward from ${edge} edge (${Math.round(distance)}px → ${EDGE_MARGIN_PX}px)`,
    };

    switch (edge) {
      case "left":
        hint.suggested_x = EDGE_MARGIN_PX;
        break;
      case "right":
        hint.suggested_x = SLIDE_W - EDGE_MARGIN_PX - w;
        break;
      case "top":
        hint.suggested_y = EDGE_MARGIN_PX;
        break;
      case "bottom":
        hint.suggested_y = SLIDE_H - EDGE_MARGIN_PX - h;
        break;
    }

    defects.push({
      type: "edge_proximity",
      eid: el.eid,
      severity,
      details,
      hint,
    });
  }

  return defects;
}
