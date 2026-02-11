import type { DOMElement } from "../../schema/dom.js";
import type { IRElement } from "../../schema/ir.js";
import type { Defect, ChainHint } from "../../schema/diag.js";
import { SAFE_PADDING, SLIDE_H, HINT_BUFFER_PX } from "../../constants.js";

interface ChainResult {
  conflict_chain: string[];
  chain_feasible: boolean;
  chain_hints: ChainHint[];
}

/**
 * Build conflict chains from overlap defects and compute coordinated hints.
 *
 * A conflict chain forms when multiple overlapping elements create a priority cascade:
 * A crowds B, B crowds C, etc. We sort by priority (highest first) and compute
 * suggested positions from head to tail.
 */
export function solveChains(
  defects: Defect[],
  domElements: DOMElement[],
  irElements: IRElement[]
): ChainResult | null {
  // Only consider overlap defects
  const overlapDefects = defects.filter((d) => d.type === "overlap");
  if (overlapDefects.length === 0) return null;

  // Build adjacency: for each pair in an overlap, track the relationship
  const irMap = new Map<string, IRElement>();
  for (const el of irElements) irMap.set(el.eid, el);

  const domMap = new Map<string, DOMElement>();
  for (const el of domElements) domMap.set(el.eid, el);

  // Build a graph of overlap relationships
  const overlapGraph = new Map<string, Set<string>>();
  for (const d of overlapDefects) {
    if (!d.owner_eid || !d.other_eid) continue;
    if (!overlapGraph.has(d.other_eid))
      overlapGraph.set(d.other_eid, new Set());
    overlapGraph.get(d.other_eid)!.add(d.owner_eid);
    if (!overlapGraph.has(d.owner_eid))
      overlapGraph.set(d.owner_eid, new Set());
  }

  // Find all eids involved in overlaps
  const involvedEids = new Set<string>();
  for (const d of overlapDefects) {
    if (d.owner_eid) involvedEids.add(d.owner_eid);
    if (d.other_eid) involvedEids.add(d.other_eid);
  }

  if (involvedEids.size < 2) return null;

  // Sort by priority descending (highest priority = chain head)
  const chainEids = [...involvedEids].sort((a, b) => {
    const pa = irMap.get(a)?.priority ?? 0;
    const pb = irMap.get(b)?.priority ?? 0;
    return pb - pa;
  });

  // Compute coordinated hints: iterate from head (highest priority) downward
  const chainHints: ChainHint[] = [];
  let currentBottom = -Infinity;
  let feasible = true;

  for (let i = 0; i < chainEids.length; i++) {
    const eid = chainEids[i]!;
    const domEl = domMap.get(eid);
    const irEl = irMap.get(eid);
    if (!domEl || !irEl) continue;

    if (i === 0) {
      // Chain head: keep in place
      chainHints.push({ eid, action: "keep" });
      currentBottom = domEl.bbox.y + domEl.bbox.h + SAFE_PADDING * 2;
    } else {
      const suggestedY = currentBottom;
      const elementH = domEl.bbox.h;

      // Check if the element fits
      if (suggestedY + elementH > SLIDE_H) {
        // Try to compress: reduce height
        const availableH = SLIDE_H - suggestedY;
        if (availableH > 0) {
          chainHints.push({
            eid,
            action: "move_down_and_shrink",
            suggested_y: Math.round(suggestedY),
            suggested_h: Math.round(availableH),
            validated: true,
          });
          currentBottom = SLIDE_H;
        } else {
          // Infeasible: not enough space
          feasible = false;
          chainHints.push({
            eid,
            action: "needs_creative_solution",
            reason: `suggested_y(${Math.round(suggestedY)}) + min_h(${elementH}) > SLIDE_H(${SLIDE_H})`,
          });
        }
      } else {
        chainHints.push({
          eid,
          action: "move_down",
          suggested_y: Math.round(suggestedY),
          validated: true,
        });
        currentBottom = suggestedY + elementH + SAFE_PADDING * 2;
      }
    }
  }

  return {
    conflict_chain: chainEids,
    chain_feasible: feasible,
    chain_hints: chainHints,
  };
}
