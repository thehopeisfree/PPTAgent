/** Hint for fixing a defect */
export interface Hint {
  action: string;
  validated: boolean;
  reason?: string;
  suggested_h?: number;
  suggested_w?: number;
  suggested_x?: number;
  suggested_y?: number;
  suggested_fontSize?: number;
  target_eid?: string;
}

/** Content overflow defect details */
export interface ContentOverflowDetails {
  overflow_x_px: number;
  overflow_y_px: number;
}

/** Out of bounds defect details */
export interface OutOfBoundsDetails {
  edge: "left" | "right" | "top" | "bottom";
  by_px: number;
}

/** Overlap defect details */
export interface OverlapDetails {
  overlap_area_px: number;
  severity_note?: string;
}

/** Font too small defect details */
export interface FontTooSmallDetails {
  current: number;
  min: number;
}

export type DefectDetails =
  | ContentOverflowDetails
  | OutOfBoundsDetails
  | OverlapDetails
  | FontTooSmallDetails;

export type DefectType =
  | "content_overflow"
  | "out_of_bounds"
  | "overlap"
  | "font_too_small";

/** A detected layout defect */
export interface Defect {
  type: DefectType;
  eid?: string;
  owner_eid?: string;
  other_eid?: string;
  severity: number;
  details: DefectDetails;
  hint?: Hint;
}

/** Warning type */
export type WarningType = "occlusion_suspected";

/** A layout warning (informational, does not count as a defect) */
export interface Warning {
  type: WarningType;
  owner_eid: string;
  other_eid: string;
  details: {
    overlap_area_px: number;
    top_eid: string;
  };
}

/** A chain hint for coordinated fixes */
export interface ChainHint {
  eid: string;
  action: string;
  validated?: boolean;
  suggested_y?: number;
  suggested_h?: number;
  reason?: string;
}

/** Summary section of diagnostics output */
export interface DiagSummary {
  defect_count: number;
  total_severity: number;
  warning_count: number;
  conflict_chain?: string[];
  chain_feasible?: boolean;
  chain_hints?: ChainHint[];
}

/** Full diagnostics output */
export interface DiagDocument {
  defects: Defect[];
  warnings: Warning[];
  summary: DiagSummary;
}
