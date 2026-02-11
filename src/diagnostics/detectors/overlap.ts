import type { DOMElement } from "../../schema/dom.js";
import type { IRElement } from "../../schema/ir.js";
import type { Defect, OverlapDetails, Warning, Hint } from "../../schema/diag.js";
import {
  MIN_OVERLAP_AREA_PX,
  SAFE_PADDING,
  TEXT_OVERLAP_SEVERITY_MULT,
  TEXT_TYPES,
} from "../../constants.js";
import { intersectionArea } from "../../utils/geometry.js";

interface ElementPair {
  domA: DOMElement;
  domB: DOMElement;
  irA: IRElement;
  irB: IRElement;
}

/**
 * Detect overlaps between element pairs.
 * Same zIndex + non-decoration → overlap defect.
 * Different zIndex + non-decoration → occlusion_suspected warning.
 * Decoration elements are exempt.
 */
export function detectOverlaps(
  domElements: DOMElement[],
  irElements: IRElement[]
): { defects: Defect[]; warnings: Warning[] } {
  const defects: Defect[] = [];
  const warnings: Warning[] = [];

  // Build eid -> IR element map
  const irMap = new Map<string, IRElement>();
  for (const el of irElements) {
    irMap.set(el.eid, el);
  }

  // Build eid -> DOM element map
  const domMap = new Map<string, DOMElement>();
  for (const el of domElements) {
    domMap.set(el.eid, el);
  }

  // Check all pairs
  for (let i = 0; i < domElements.length; i++) {
    for (let j = i + 1; j < domElements.length; j++) {
      const domA = domElements[i]!;
      const domB = domElements[j]!;
      const irA = irMap.get(domA.eid);
      const irB = irMap.get(domB.eid);
      if (!irA || !irB) continue;

      // Skip if either is decoration
      if (irA.type === "decoration" || irB.type === "decoration") continue;

      const area = intersectionArea(domA.safeBox, domB.safeBox);
      if (area < MIN_OVERLAP_AREA_PX) continue;

      // Determine owner (lower priority) vs other (higher priority)
      let owner: { dom: DOMElement; ir: IRElement };
      let other: { dom: DOMElement; ir: IRElement };
      if (irA.priority <= irB.priority) {
        owner = { dom: domA, ir: irA };
        other = { dom: domB, ir: irB };
      } else {
        owner = { dom: domB, ir: irB };
        other = { dom: domA, ir: irA };
      }

      const sameZIndex = domA.zIndex === domB.zIndex;

      if (sameZIndex) {
        // Hard defect: overlap
        const isTextInvolved =
          TEXT_TYPES.has(irA.type) || TEXT_TYPES.has(irB.type);
        const severityMult = isTextInvolved ? TEXT_OVERLAP_SEVERITY_MULT : 1;
        const severity = Math.round(area * severityMult);

        const details: OverlapDetails = {
          overlap_area_px: Math.round(area),
        };
        if (isTextInvolved) {
          details.severity_note = `×${TEXT_OVERLAP_SEVERITY_MULT} (text involved)`;
        }

        // Compute move hint for owner element
        const hint = computeMoveHint(owner.dom, other.dom);

        defects.push({
          type: "overlap",
          owner_eid: owner.ir.eid,
          other_eid: other.ir.eid,
          severity,
          details,
          hint,
        });
      } else {
        // Warning: occlusion_suspected
        const topEid =
          domA.zIndex > domB.zIndex ? domA.eid : domB.eid;

        warnings.push({
          type: "occlusion_suspected",
          owner_eid: owner.ir.eid,
          other_eid: other.ir.eid,
          details: {
            overlap_area_px: Math.round(area),
            top_eid: topEid,
          },
        });
      }
    }
  }

  return { defects, warnings };
}

/**
 * Compute a move hint to resolve overlap.
 * Finds the smallest move direction for the owner element.
 */
function computeMoveHint(owner: DOMElement, other: DOMElement): Hint {
  // Calculate distances needed in each direction to clear the overlap
  const clearLeft = other.safeBox.x - (owner.safeBox.x + owner.safeBox.w);
  const clearRight =
    other.safeBox.x + other.safeBox.w - owner.safeBox.x;
  const clearUp = other.safeBox.y - (owner.safeBox.y + owner.safeBox.h);
  const clearDown =
    other.safeBox.y + other.safeBox.h - owner.safeBox.y;

  // Move down: owner.bbox.y needs to be at other.safeBox.y + other.safeBox.h - SAFE_PADDING
  // (because owner.safeBox.y = owner.bbox.y - SAFE_PADDING)
  const moveDownTarget = other.safeBox.y + other.safeBox.h - SAFE_PADDING;
  const moveUpTarget =
    other.safeBox.y - owner.safeBox.h + SAFE_PADDING - SAFE_PADDING;
  const moveRightTarget = other.safeBox.x + other.safeBox.w - SAFE_PADDING;
  const moveLeftTarget =
    other.safeBox.x - owner.safeBox.w + SAFE_PADDING - SAFE_PADDING;

  // Choose the direction with the smallest absolute move
  const moves: Array<{
    direction: string;
    dist: number;
    target: number;
    prop: "suggested_y" | "suggested_x";
  }> = [
    {
      direction: "move_down",
      dist: Math.abs(moveDownTarget - owner.bbox.y),
      target: moveDownTarget,
      prop: "suggested_y",
    },
    {
      direction: "move_up",
      dist: Math.abs(owner.bbox.y - (other.bbox.y - owner.bbox.h - SAFE_PADDING * 2)),
      target: other.bbox.y - owner.bbox.h - SAFE_PADDING * 2,
      prop: "suggested_y",
    },
    {
      direction: "move_right",
      dist: Math.abs(moveRightTarget - owner.bbox.x),
      target: moveRightTarget,
      prop: "suggested_x",
    },
    {
      direction: "move_left",
      dist: Math.abs(owner.bbox.x - (other.bbox.x - owner.bbox.w - SAFE_PADDING * 2)),
      target: other.bbox.x - owner.bbox.w - SAFE_PADDING * 2,
      prop: "suggested_x",
    },
  ];

  // Sort by distance, pick smallest
  moves.sort((a, b) => a.dist - b.dist);
  const best = moves[0]!;

  const hint: Hint = {
    action: best.direction,
    validated: true,
    target_eid: owner.eid,
    reason: `clear ${other.eid} safeBox edge`,
  };
  hint[best.prop] = Math.round(best.target);

  return hint;
}
