import type { DOMElement } from "../../schema/dom.js";
import type { IRElement } from "../../schema/ir.js";
import type {
  Defect,
  ConflictComponent,
  ConflictEdge,
  SpaceEnvelope,
} from "../../schema/diag.js";
import { SAFE_PADDING, SLIDE_H, SLIDE_W } from "../../constants.js";
import { computeSeparationOptions } from "./separation-calculator.js";

/**
 * Analyze overlap conflicts and produce a conflict graph.
 *
 * Decomposes overlap defects into connected components (BFS).
 * For each component:
 *   - computes per-edge separation options (4 directions with costs)
 *   - computes space envelopes (free space around each element)
 *
 * Does NOT pick an axis, suggest positions, order elements, or judge
 * feasibility — that's the LLM's job.
 */
export function analyzeConflicts(
  defects: Defect[],
  domElements: DOMElement[],
  irElements: IRElement[],
): ConflictComponent[] {
  const overlapDefects = defects.filter((d) => d.type === "overlap");
  if (overlapDefects.length === 0) return [];

  const domMap = new Map<string, DOMElement>();
  for (const el of domElements) domMap.set(el.eid, el);

  const irMap = new Map<string, IRElement>();
  for (const el of irElements) irMap.set(el.eid, el);

  // ── Build undirected adjacency graph ──
  const adj = new Map<string, Set<string>>();
  const ensureNode = (eid: string) => {
    if (!adj.has(eid)) adj.set(eid, new Set());
  };

  // Build edge list indexed by "owner|other" for quick lookup
  const defectByPair = new Map<string, Defect>();
  for (const d of overlapDefects) {
    if (!d.owner_eid || !d.other_eid) continue;
    ensureNode(d.owner_eid);
    ensureNode(d.other_eid);
    adj.get(d.owner_eid)!.add(d.other_eid);
    adj.get(d.other_eid)!.add(d.owner_eid);
    defectByPair.set(`${d.owner_eid}|${d.other_eid}`, d);
  }

  const allEids = [...adj.keys()];
  if (allEids.length < 2) return [];

  // ── Connected components via BFS ──
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const startEid of allEids) {
    if (visited.has(startEid)) continue;
    const component: string[] = [];
    const queue = [startEid];
    visited.add(startEid);
    while (queue.length > 0) {
      const eid = queue.shift()!;
      component.push(eid);
      for (const neighbor of adj.get(eid) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (component.length >= 2) {
      components.push(component);
    }
  }

  if (components.length === 0) return [];

  // ── Build non-decoration element list for envelope scanning ──
  const nonDecoEls = domElements.filter((el) => {
    const ir = irMap.get(el.eid);
    return ir && ir.type !== "decoration";
  });

  // ── Analyze each component ──
  const results: ConflictComponent[] = [];

  for (const component of components) {
    const componentSet = new Set(component);

    // ── Edges: separation options for each overlap pair ──
    const edges: ConflictEdge[] = [];
    for (const d of overlapDefects) {
      if (!d.owner_eid || !d.other_eid) continue;
      if (!componentSet.has(d.owner_eid) || !componentSet.has(d.other_eid)) continue;

      const ownerDom = domMap.get(d.owner_eid);
      const otherDom = domMap.get(d.other_eid);
      if (!ownerDom || !otherDom) continue;

      const details = d.details as { overlap_area_px: number };
      const separations = computeSeparationOptions(ownerDom, otherDom);

      edges.push({
        owner_eid: d.owner_eid,
        other_eid: d.other_eid,
        overlap_area: details.overlap_area_px,
        separations,
      });
    }

    // ── Space envelopes ──
    const envelopes: SpaceEnvelope[] = [];
    for (const eid of component) {
      const domEl = domMap.get(eid);
      if (!domEl) continue;

      const sb = domEl.safeBox;
      let freeTop = sb.y;
      let freeBottom = SLIDE_H - (sb.y + sb.h);
      let freeLeft = sb.x;
      let freeRight = SLIDE_W - (sb.x + sb.w);

      const irEl = irMap.get(eid);
      for (const other of nonDecoEls) {
        if (other.eid === eid) continue;
        // Same-group elements don't block each other
        const otherIr = irMap.get(other.eid);
        if (irEl?.group && irEl.group === otherIr?.group) continue;
        const os = other.safeBox;

        // Check if other is above A and horizontally overlapping
        const hOverlap =
          Math.min(sb.x + sb.w, os.x + os.w) - Math.max(sb.x, os.x);
        if (hOverlap > 0) {
          // Other is above
          if (os.y + os.h <= sb.y) {
            const gap = sb.y - (os.y + os.h);
            freeTop = Math.min(freeTop, gap);
          }
          // Other is below
          if (os.y >= sb.y + sb.h) {
            const gap = os.y - (sb.y + sb.h);
            freeBottom = Math.min(freeBottom, gap);
          }
        }

        // Check if other is beside A and vertically overlapping
        const vOverlap =
          Math.min(sb.y + sb.h, os.y + os.h) - Math.max(sb.y, os.y);
        if (vOverlap > 0) {
          // Other is to the left
          if (os.x + os.w <= sb.x) {
            const gap = sb.x - (os.x + os.w);
            freeLeft = Math.min(freeLeft, gap);
          }
          // Other is to the right
          if (os.x >= sb.x + sb.w) {
            const gap = os.x - (sb.x + sb.w);
            freeRight = Math.min(freeRight, gap);
          }
        }
      }

      envelopes.push({
        eid,
        free_top: Math.max(0, Math.round(freeTop)),
        free_bottom: Math.max(0, Math.round(freeBottom)),
        free_left: Math.max(0, Math.round(freeLeft)),
        free_right: Math.max(0, Math.round(freeRight)),
      });
    }

    results.push({
      eids: component,
      edges,
      envelopes,
    });
  }

  return results;
}
