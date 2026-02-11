import type { DOMElement } from "../../schema/dom.js";
import type { IRElement } from "../../schema/ir.js";
import type { Defect, OverlapDetails, Warning, Hint } from "../../schema/diag.js";
import {
  MIN_OVERLAP_AREA_PX,
  TEXT_OVERLAP_SEVERITY_MULT,
  TEXT_TYPES,
} from "../../constants.js";
import { intersectionArea } from "../../utils/geometry.js";
import { computeSeparationOptions } from "../hints/separation-calculator.js";

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

      // Skip if both belong to the same group (e.g. text on shape)
      if (irA.group && irA.group === irB.group) continue;

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
 * Delegates to computeSeparationOptions and picks the cheapest direction.
 */
function computeMoveHint(owner: DOMElement, other: DOMElement): Hint {
  const options = computeSeparationOptions(owner, other);
  const best = options[0]!;

  const hint: Hint = {
    action: best.direction,
    validated: true,
    target_eid: owner.eid,
    reason: `clear ${other.eid} safeBox edge`,
  };
  if (best.target_y != null) hint.suggested_y = best.target_y;
  if (best.target_x != null) hint.suggested_x = best.target_x;

  return hint;
}
