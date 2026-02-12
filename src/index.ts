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
  IMAGE_ASPECT_RATIO_EPS,
  DEFAULT_Z_INDEX,
  TOPOLOGY_SEVERITY,
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
  SeparationOption,
  ConflictEdge,
  SpaceEnvelope,
  ConflictComponent,
  DiagSummary,
  DiagDocument,
  ContentOverflowDetails,
  OutOfBoundsDetails,
  OverlapDetails,
  FontTooSmallDetails,
  LayoutTopologyDetails,
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
export { detectLayoutTopology } from "./diagnostics/detectors/layout-topology.js";
export { detectContentOverflow } from "./diagnostics/detectors/content-overflow.js";
export { detectOutOfBounds } from "./diagnostics/detectors/out-of-bounds.js";
export { detectOverlaps } from "./diagnostics/detectors/overlap.js";
export { detectFontTooSmall } from "./diagnostics/detectors/font-too-small.js";
export { totalSeverity } from "./diagnostics/severity.js";
export { validateHint } from "./diagnostics/hints/hint-calculator.js";
export { analyzeConflicts } from "./diagnostics/hints/conflict-solver.js";
export { computeSeparationOptions } from "./diagnostics/hints/separation-calculator.js";

// Driver
export {
  createSession,
  initRollout,
  stepRollout,
  computeFingerprint,
  checkPatch,
  buildStorySoFar,
} from "./driver/loop-driver.js";
export type { RolloutSession, StepResult, CheckPatchResult } from "./driver/loop-driver.js";

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

// Browser launch helper
export { launchBrowser } from "./utils/browser.js";

// FS helpers
export {
  readJSON,
  writeJSON,
  appendTrace,
  rolloutPaths,
  writeFile,
} from "./utils/fs-helpers.js";

// Debug tools
export { generateDebugHTML } from "./debug/visual-debug.js";
export type { DebugSnapshot } from "./debug/visual-debug.js";
export { syntheticIRFromDOM } from "./debug/synthetic-ir.js";
export type { InputElement } from "./debug/synthetic-ir.js";
export { injectDebugOverlay, toggleLayer, removeDebugOverlay } from "./debug/overlay.js";
export type { OverlayOptions, OverlayLayer } from "./debug/overlay.js";

// IR inference (auto-generate IR from rendered HTML)
export {
  inferIR,
  inferIRFromDOM,
  inferType,
  inferPriority,
  extractTypeSignals,
} from "./ir/infer-ir.js";
export type { TypeSignal } from "./ir/infer-ir.js";

// Flatten (flexbox → absolute)
export { flattenHTML } from "./flatten/flatten-html.js";
export type { FlattenedElement } from "./flatten/flatten-html.js";

// PPTX conversion
export { htmlToPptx, htmlToPptxFile, htmlToPptxBuffer } from "./pptx/html-to-pptx.js";
