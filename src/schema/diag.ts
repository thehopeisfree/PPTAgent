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

/** Layout topology violation details */
export interface LayoutTopologyDetails {
  rule: string;
  title_eid: string;
  body_eid: string;
  title_cy: number;
  body_cy: number;
}

export type DefectDetails =
  | ContentOverflowDetails
  | OutOfBoundsDetails
  | OverlapDetails
  | FontTooSmallDetails
  | LayoutTopologyDetails;

export type DefectType =
  | "layout_topology"
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

/** One of 4 ways to fix an overlap (move owner in a direction) */
export interface SeparationOption {
  direction: "move_up" | "move_down" | "move_left" | "move_right";
  target_x?: number;
  target_y?: number;
  cost_px: number;
}

/** One overlap pair with all fix options */
export interface ConflictEdge {
  owner_eid: string;
  other_eid: string;
  overlap_area: number;
  separations: SeparationOption[];
}

/** Free space around an element (px to nearest obstacle or slide edge) */
export interface SpaceEnvelope {
  eid: string;
  free_top: number;
  free_bottom: number;
  free_left: number;
  free_right: number;
}

/** A connected subgraph of overlapping elements */
export interface ConflictComponent {
  eids: string[];
  edges: ConflictEdge[];
  envelopes: SpaceEnvelope[];
}

/** Summary section of diagnostics output */
export interface DiagSummary {
  defect_count: number;
  total_severity: number;
  warning_count: number;
  warning_severity: number;
  conflict_graph?: ConflictComponent[];
}

/** Full diagnostics output */
export interface DiagDocument {
  defects: Defect[];
  warnings: Warning[];
  summary: DiagSummary;
}
