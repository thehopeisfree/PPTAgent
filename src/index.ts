// Constants
export {
  SLIDE_W,
  SLIDE_H,
  SAFE_PADDING,
  MIN_OVERLAP_AREA_PX,
  OOB_EPS_PX,
  HINT_BUFFER_PX,
  MAX_ITER,
  STALL_THRESHOLD,
  HIGH_PRIO_SIZE_BUDGET,
  HIGH_PRIO_MOVE_PX,
  ALLOW_HIDE,
  TEXT_OVERLAP_SEVERITY_MULT,
  MIN_FONT_BY_PRIORITY,
  TEXT_TYPES,
  DEFAULT_Z_INDEX,
} from "./constants.js";

// Schema types
export type {
  ElementType,
  Layout,
  Style,
  IRElement,
  IRDocument,
} from "./schema/ir.js";
export { parseIR, IRDocumentSchema, IRElementSchema } from "./schema/ir.js";

export type { Rect, DOMElement, DOMDocument } from "./schema/dom.js";

export type {
  Hint,
  Defect,
  DefectType,
  Warning,
  WarningType,
  ChainHint,
  DiagSummary,
  DiagDocument,
  ContentOverflowDetails,
  OutOfBoundsDetails,
  OverlapDetails,
  FontTooSmallDetails,
} from "./schema/diag.js";

export type { PatchEdit, PatchDocument } from "./schema/patch.js";
export { parsePatch, PatchDocumentSchema } from "./schema/patch.js";

export type {
  QualityLabel,
  Override,
  AppliedHint,
  TraceEntry,
  RolloutMetrics,
} from "./schema/trace.js";

// Core functions
export { renderHTML } from "./renderer/html-renderer.js";
export { extractDOM, extractDOMWithPage, screenshotSlide } from "./extraction/dom-extractor.js";
export { diagnose } from "./diagnostics/engine.js";
export { applyPatch } from "./patch/apply-patch.js";
export type { ApplyPatchResult } from "./patch/apply-patch.js";

// Diagnostics internals (for advanced usage)
export { detectContentOverflow } from "./diagnostics/detectors/content-overflow.js";
export { detectOutOfBounds } from "./diagnostics/detectors/out-of-bounds.js";
export { detectOverlaps } from "./diagnostics/detectors/overlap.js";
export { detectFontTooSmall } from "./diagnostics/detectors/font-too-small.js";
export { totalSeverity } from "./diagnostics/severity.js";
export { validateHint } from "./diagnostics/hints/hint-calculator.js";
export { solveChains } from "./diagnostics/hints/chain-solver.js";

// Driver
export {
  createSession,
  initRollout,
  stepRollout,
} from "./driver/loop-driver.js";
export type { RolloutSession, StepResult } from "./driver/loop-driver.js";

// Geometry utilities
export {
  inflateRect,
  intersectRects,
  intersectionArea,
  clampToSlide,
  oobEdges,
  isInBounds,
  unionRects,
  rectArea,
} from "./utils/geometry.js";

// FS helpers
export {
  readJSON,
  writeJSON,
  appendTrace,
  rolloutPaths,
  writeFile,
} from "./utils/fs-helpers.js";
