import type { Defect } from "../schema/diag.js";

/** Compute the total severity of a list of defects */
export function totalSeverity(defects: Defect[]): number {
  let total = 0;
  for (const d of defects) {
    total += d.severity;
  }
  return total;
}
