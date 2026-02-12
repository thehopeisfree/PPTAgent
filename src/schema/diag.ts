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
  limited_by_budget?: boolean;
  budget_max_delta?: number;
  steps_needed?: number;
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

/** Edge proximity defect details */
export interface EdgeProximityDetails {
  edge: "left" | "right" | "top" | "bottom";
  distance_px: number;
  threshold_px: number;
}

/** Content underflow defect details */
export interface ContentUnderflowDetails {
  underflow_y_px: number;
  ratio: number; // bbox.h / contentBox.h
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
  | LayoutTopologyDetails
  | EdgeProximityDetails
  | ContentUnderflowDetails;

export type DefectType =
  | "layout_topology"
  | "content_overflow"
  | "content_underflow"
  | "out_of_bounds"
  | "overlap"
  | "font_too_small"
  | "edge_proximity";

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
export type WarningType = "occlusion_suspected" | "whitespace_excess";

/** Occlusion warning: cross-zIndex overlap between non-decoration elements */
export interface OcclusionWarning {
  type: "occlusion_suspected";
  owner_eid: string;
  other_eid: string;
  details: {
    overlap_area_px: number;
    top_eid: string;
  };
}

/** Whitespace excess warning: slide element coverage below threshold */
export interface WhitespaceExcessWarning {
  type: "whitespace_excess";
  details: {
    coverage_pct: number; // 0–100
    threshold_pct: number; // 30
    element_area_px: number;
    slide_area_px: number;
  };
}

/** A layout warning (informational, does not count as a defect) */
export type Warning = OcclusionWarning | WhitespaceExcessWarning;

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
  anchor_eid: string;
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
