import type { DOMDocument } from "../schema/dom.js";
import type { IRDocument } from "../schema/ir.js";
import type { DiagDocument, Defect, Warning } from "../schema/diag.js";
import { detectLayoutTopology } from "./detectors/layout-topology.js";
import { detectContentOverflow } from "./detectors/content-overflow.js";
import { detectOutOfBounds } from "./detectors/out-of-bounds.js";
import { detectOverlaps } from "./detectors/overlap.js";
import { detectFontTooSmall } from "./detectors/font-too-small.js";
import { analyzeConflicts } from "./hints/conflict-solver.js";
import { validateHint, annotateBudgetConstraints } from "./hints/hint-calculator.js";
import { totalSeverity } from "./severity.js";

/**
 * Run full diagnostics on a DOM extraction result against the IR.
 * Detects defects in fix priority order: topology → font → overflow → OOB → overlap.
 * Validates hints, solves conflict chains, computes total severity.
 */
export function diagnose(dom: DOMDocument, ir: IRDocument): DiagDocument {
  const defects: Defect[] = [];
  const warnings: Warning[] = [];

  // Build eid -> IR element map
  const irMap = new Map<string, (typeof ir.elements)[number]>();
  for (const el of ir.elements) {
    irMap.set(el.eid, el);
  }

  // 1. layout_topology (highest fix priority — structural issues)
  const topologyDefects = detectLayoutTopology(dom.elements, ir.elements);
  defects.push(...topologyDefects);

  // 2. font_too_small
  for (const domEl of dom.elements) {
    const irEl = irMap.get(domEl.eid);
    if (!irEl) continue;
    const defect = detectFontTooSmall(domEl, irEl);
    if (defect) defects.push(defect);
  }

  // 3. content_overflow
  for (const domEl of dom.elements) {
    const defect = detectContentOverflow(domEl);
    if (defect) defects.push(defect);
  }

  // 4. out_of_bounds
  for (const domEl of dom.elements) {
    const oobDefects = detectOutOfBounds(domEl);
    defects.push(...oobDefects);
  }

  // 5. overlap (defects) + occlusion_suspected (warnings)
  const { defects: overlapDefects, warnings: occlusionWarnings } =
    detectOverlaps(dom.elements, ir.elements);
  defects.push(...overlapDefects);
  warnings.push(...occlusionWarnings);

  // Validate all hints
  for (const d of defects) {
    if (d.hint) {
      d.hint = validateHint(d.hint);
    }
  }

  // Annotate hints with budget constraints for high-priority elements
  annotateBudgetConstraints(defects, ir.elements, dom.elements);

  // Analyze conflict graph
  const conflictGraph = analyzeConflicts(defects, dom.elements, ir.elements);

  // Compute severity
  const severity = totalSeverity(defects);

  // Compute warning severity (sum of overlap areas from warnings)
  let warningSeverity = 0;
  for (const w of warnings) {
    warningSeverity += w.details.overlap_area_px;
  }

  const summary: DiagDocument["summary"] = {
    defect_count: defects.length,
    total_severity: severity,
    warning_count: warnings.length,
    warning_severity: warningSeverity,
  };

  if (conflictGraph.length > 0) {
    summary.conflict_graph = conflictGraph;
  }

  return { defects, warnings, summary };
}
