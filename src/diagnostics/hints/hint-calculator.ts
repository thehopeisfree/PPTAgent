import type { Defect, Hint } from "../../schema/diag.js";
import type { IRElement } from "../../schema/ir.js";
import type { DOMElement } from "../../schema/dom.js";
import { SLIDE_W, SLIDE_H, HIGH_PRIO_MOVE_PX, HIGH_PRIO_SIZE_BUDGET } from "../../constants.js";

/**
 * Validate and clamp a hint to ensure it produces a valid target state:
 * - Non-negative sizes
 * - Within slide bounds
 */
export function validateHint(hint: Hint): Hint {
  const validated = { ...hint };

  if (validated.suggested_x != null) {
    validated.suggested_x = Math.max(0, validated.suggested_x);
  }
  if (validated.suggested_y != null) {
    validated.suggested_y = Math.max(0, validated.suggested_y);
  }
  if (validated.suggested_w != null) {
    validated.suggested_w = Math.max(1, Math.min(validated.suggested_w, SLIDE_W));
  }
  if (validated.suggested_h != null) {
    validated.suggested_h = Math.max(1, Math.min(validated.suggested_h, SLIDE_H));
  }
  if (validated.suggested_fontSize != null) {
    validated.suggested_fontSize = Math.max(1, validated.suggested_fontSize);
  }

  // Ensure x + w and y + h don't exceed slide bounds
  if (validated.suggested_x != null && validated.suggested_w != null) {
    if (validated.suggested_x + validated.suggested_w > SLIDE_W) {
      validated.suggested_w = SLIDE_W - validated.suggested_x;
    }
  }
  if (validated.suggested_y != null && validated.suggested_h != null) {
    if (validated.suggested_y + validated.suggested_h > SLIDE_H) {
      validated.suggested_h = SLIDE_H - validated.suggested_y;
    }
  }

  validated.validated = true;
  return validated;
}

/**
 * Annotate hints that target high-priority (>=80) elements with budget constraint info.
 * Mutates defect hints in place: sets limited_by_budget, budget_max_delta, steps_needed.
 */
export function annotateBudgetConstraints(
  defects: Defect[],
  irElements: IRElement[],
  domElements: DOMElement[],
): void {
  const irMap = new Map<string, IRElement>();
  for (const el of irElements) irMap.set(el.eid, el);

  const domMap = new Map<string, DOMElement>();
  for (const el of domElements) domMap.set(el.eid, el);

  for (const defect of defects) {
    const hint = defect.hint;
    if (!hint) continue;

    const targetEid = hint.target_eid ?? defect.eid ?? defect.owner_eid;
    if (!targetEid) continue;

    const irEl = irMap.get(targetEid);
    if (!irEl || irEl.priority < 80) continue;

    let maxNeededSteps = 1;

    // Check position deltas
    for (const prop of ["x", "y"] as const) {
      const suggested = prop === "x" ? hint.suggested_x : hint.suggested_y;
      if (suggested == null) continue;
      const current = irEl.layout[prop];
      const delta = Math.abs(suggested - current);
      if (delta > HIGH_PRIO_MOVE_PX) {
        const steps = Math.ceil(delta / HIGH_PRIO_MOVE_PX);
        if (steps > maxNeededSteps) maxNeededSteps = steps;
        hint.limited_by_budget = true;
        hint.budget_max_delta = Math.min(hint.budget_max_delta ?? Infinity, HIGH_PRIO_MOVE_PX);
      }
    }

    // Check size deltas (w, h)
    for (const prop of ["w", "h"] as const) {
      const suggested = prop === "w" ? hint.suggested_w : hint.suggested_h;
      if (suggested == null) continue;
      const current = irEl.layout[prop];
      if (current === 0) continue;
      const ratio = Math.abs(suggested - current) / current;
      if (ratio > HIGH_PRIO_SIZE_BUDGET) {
        const steps = Math.ceil(Math.log(suggested / current) / Math.log(1 + HIGH_PRIO_SIZE_BUDGET * Math.sign(suggested - current)));
        if (Math.abs(steps) > maxNeededSteps) maxNeededSteps = Math.abs(steps);
        hint.limited_by_budget = true;
        hint.budget_max_delta = Math.min(hint.budget_max_delta ?? Infinity, Math.round(current * HIGH_PRIO_SIZE_BUDGET));
      }
    }

    // Check fontSize delta
    if (hint.suggested_fontSize != null && irEl.style.fontSize != null) {
      const current = irEl.style.fontSize;
      const ratio = Math.abs(hint.suggested_fontSize - current) / current;
      if (ratio > HIGH_PRIO_SIZE_BUDGET) {
        const steps = Math.ceil(Math.log(hint.suggested_fontSize / current) / Math.log(1 + HIGH_PRIO_SIZE_BUDGET * Math.sign(hint.suggested_fontSize - current)));
        if (Math.abs(steps) > maxNeededSteps) maxNeededSteps = Math.abs(steps);
        hint.limited_by_budget = true;
        hint.budget_max_delta = Math.min(hint.budget_max_delta ?? Infinity, Math.round(current * HIGH_PRIO_SIZE_BUDGET));
      }
    }

    if (hint.limited_by_budget) {
      hint.steps_needed = maxNeededSteps;
    }
  }
}
