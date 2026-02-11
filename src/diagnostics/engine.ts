import type { DOMDocument } from "../schema/dom.js";
import type { IRDocument } from "../schema/ir.js";
import type { DiagDocument, Defect, Warning } from "../schema/diag.js";
import { detectContentOverflow } from "./detectors/content-overflow.js";
import { detectOutOfBounds } from "./detectors/out-of-bounds.js";
import { detectOverlaps } from "./detectors/overlap.js";
import { detectFontTooSmall } from "./detectors/font-too-small.js";
import { solveChains } from "./hints/chain-solver.js";
import { validateHint } from "./hints/hint-calculator.js";
import { totalSeverity } from "./severity.js";

/**
 * Run full diagnostics on a DOM extraction result against the IR.
 * Detects defects in fix priority order: font → overflow → OOB → overlap.
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

  // 1. font_too_small (highest fix priority)
  for (const domEl of dom.elements) {
    const irEl = irMap.get(domEl.eid);
    if (!irEl) continue;
    const defect = detectFontTooSmall(domEl, irEl);
    if (defect) defects.push(defect);
  }

  // 2. content_overflow
  for (const domEl of dom.elements) {
    const defect = detectContentOverflow(domEl);
    if (defect) defects.push(defect);
  }

  // 3. out_of_bounds
  for (const domEl of dom.elements) {
    const oobDefects = detectOutOfBounds(domEl);
    defects.push(...oobDefects);
  }

  // 4. overlap (defects) + occlusion_suspected (warnings)
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

  // Solve conflict chains
  const chainResult = solveChains(defects, dom.elements, ir.elements);

  // Compute severity
  const severity = totalSeverity(defects);

  // Build unique defect and warning type lists
  const defectTypes = [...new Set(defects.map((d) => d.type))];
  const warningTypes = [...new Set(warnings.map((w) => w.type))];

  const summary: DiagDocument["summary"] = {
    defect_count: defects.length,
    total_severity: severity,
    warning_count: warnings.length,
  };

  if (chainResult) {
    summary.conflict_chain = chainResult.conflict_chain;
    summary.chain_feasible = chainResult.chain_feasible;
    summary.chain_hints = chainResult.chain_hints;
  }

  return { defects, warnings, summary };
}
