import type { DOMElement } from "../../schema/dom.js";
import type { IRElement } from "../../schema/ir.js";
import type { Defect, LayoutTopologyDetails, Hint } from "../../schema/diag.js";
import { TOPOLOGY_SEVERITY, SAFE_PADDING } from "../../constants.js";

/** Body element types that should appear below a title */
const BODY_TYPES = new Set(["bullets", "text"]);

/**
 * Detect layout topology violations: title center-y must not be
 * below body (bullets/text) center-y.
 *
 * Pure relative-position check — no magic pixel thresholds.
 */
export function detectLayoutTopology(
  domElements: DOMElement[],
  irElements: IRElement[]
): Defect[] {
  const defects: Defect[] = [];

  // Build maps
  const irMap = new Map<string, IRElement>();
  for (const el of irElements) {
    irMap.set(el.eid, el);
  }

  const domMap = new Map<string, DOMElement>();
  for (const el of domElements) {
    domMap.set(el.eid, el);
  }

  // Collect title and body elements
  const titles: Array<{ dom: DOMElement; ir: IRElement }> = [];
  const bodies: Array<{ dom: DOMElement; ir: IRElement }> = [];

  for (const domEl of domElements) {
    const irEl = irMap.get(domEl.eid);
    if (!irEl) continue;
    if (irEl.type === "title") {
      titles.push({ dom: domEl, ir: irEl });
    } else if (BODY_TYPES.has(irEl.type)) {
      bodies.push({ dom: domEl, ir: irEl });
    }
  }

  // Check each title against each body element
  for (const title of titles) {
    const titleCy = title.dom.bbox.y + title.dom.bbox.h / 2;

    for (const body of bodies) {
      const bodyCy = body.dom.bbox.y + body.dom.bbox.h / 2;

      // Strict greater-than: title center below body center is a violation
      if (titleCy > bodyCy) {
        const details: LayoutTopologyDetails = {
          rule: "title_above_body",
          title_eid: title.ir.eid,
          body_eid: body.ir.eid,
          title_cy: Math.round(titleCy),
          body_cy: Math.round(bodyCy),
        };

        // Hint: move title above the body element
        const suggestedY = body.dom.bbox.y - title.dom.bbox.h - SAFE_PADDING;
        const hint: Hint = {
          action: "move_to_top",
          target_eid: title.ir.eid,
          suggested_y: Math.max(0, Math.round(suggestedY)),
          validated: true,
          reason: `title(${title.ir.eid}) center-y(${Math.round(titleCy)}) > body(${body.ir.eid}) center-y(${Math.round(bodyCy)})`,
        };

        defects.push({
          type: "layout_topology",
          eid: title.ir.eid,
          owner_eid: title.ir.eid,
          other_eid: body.ir.eid,
          severity: TOPOLOGY_SEVERITY,
          details,
          hint,
        });
      }
    }
  }

  return defects;
}
