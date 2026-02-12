/** Slide dimensions (px) */
export const SLIDE_W = 1280;
export const SLIDE_H = 720;

/** SafeBox inflation per side (px) */
export const SAFE_PADDING = 8;

/** Minimum overlap area to report (px²), avoids jitter loops */
export const MIN_OVERLAP_AREA_PX = 100;

/** Out-of-bounds tolerance (px) */
export const OOB_EPS_PX = 1;

/** Buffer added to hint suggestions (px) */
export const HINT_BUFFER_PX = 8;

/** Maximum refinement iterations */
export const MAX_ITER = 3;

/** Consecutive non-improving iterations to trigger rollback */
export const STALL_THRESHOLD = 2;

/**
 * Max single-patch ratio change for size properties (w, h, fontSize, lineHeight)
 * on priority >= 80 elements.
 */
export const HIGH_PRIO_SIZE_BUDGET = 0.15;

/**
 * Max single-patch absolute move for position properties (x, y)
 * on priority >= 80 elements.
 */
export const HIGH_PRIO_MOVE_PX = 48;

/** Whether Hard Fallback may set display: none on elements */
export const ALLOW_HIDE = false;

/** Severity multiplier when overlap involves text elements */
export const TEXT_OVERLAP_SEVERITY_MULT = 2;

/** Minimum font size thresholds by priority tier */
export const MIN_FONT_BY_PRIORITY: ReadonlyMap<number, number> = new Map([
  [100, 32],
  [80, 20],
  [60, 16],
]);

/** Severity for layout topology violations (structural, far above normal defects) */
export const TOPOLOGY_SEVERITY = 5000;

/** Text element types (used for severity multiplier) */
export const TEXT_TYPES = new Set(["title", "text", "bullets"]);

/** Edge proximity threshold — elements closer than this to the slide edge are flagged (px) */
export const EDGE_MARGIN_PX = 24;

/** Tolerance for image aspect ratio deviation (1%) */
export const IMAGE_ASPECT_RATIO_EPS = 0.01;

/** Default zIndex for content elements */
export const DEFAULT_Z_INDEX = 10;
