import type { DefectType, WarningType } from "./diag.js";

/** Quality label for a rollout */
export type QualityLabel = "success_clean" | "success_with_warnings" | "degraded";

/** Override record logged when budget clamping occurs */
export interface Override {
  eid: string;
  field: string;
  requested: number;
  clamped_to: number;
  reason: string;
}

/** Applied hint record */
export interface AppliedHint {
  eid: string;
  action: string;
  [key: string]: unknown;
}

/** A single trace entry (one per iteration) */
export interface TraceEntry {
  iter: number;
  defect_count: number;
  total_severity: number;
  warning_count: number;
  warning_severity: number;
  defect_types: DefectType[];
  warning_types?: WarningType[];
  action: string;
  applied_hints?: AppliedHint[];
  overrides?: Override[];
  rejected_fingerprint?: string;
}

/** Rollout-level metrics */
export interface RolloutMetrics {
  defect_count_per_iter: number[];
  total_severity_per_iter: number[];
  warning_count_per_iter: number[];
  iterations_to_converge: number;
  final_defect_types: DefectType[];
  final_warning_types: WarningType[];
  quality: QualityLabel;
  budget_overrides: number;
  taboo_fingerprints?: string[];
}
