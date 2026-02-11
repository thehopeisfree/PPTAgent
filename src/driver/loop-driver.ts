import type { Browser, BrowserContext, Page } from "playwright";
import type { IRDocument } from "../schema/ir.js";
import type { PatchDocument } from "../schema/patch.js";
import type { DiagDocument } from "../schema/diag.js";
import type { DOMDocument } from "../schema/dom.js";
import type {
  TraceEntry,
  Override,
  QualityLabel,
  RolloutMetrics,
} from "../schema/trace.js";
import { renderHTML } from "../renderer/html-renderer.js";
import { extractDOM, screenshotSlide } from "../extraction/dom-extractor.js";
import { diagnose } from "../diagnostics/engine.js";
import { applyPatch } from "../patch/apply-patch.js";
import {
  writeJSON,
  writeFile,
  appendTrace,
  rolloutPaths,
} from "../utils/fs-helpers.js";
import { MAX_ITER, STALL_THRESHOLD, ALLOW_HIDE } from "../constants.js";

/** Iteration snapshot stored for rollback */
interface IterationSnapshot {
  iter: number;
  ir: IRDocument;
  diag: DiagDocument;
  defectCount: number;
  totalSeverity: number;
  warningCount: number;
}

/** The result of a single step in the refinement loop */
export interface StepResult {
  iter: number;
  ir: IRDocument;
  diag: DiagDocument;
  dom: DOMDocument;
  stopped: boolean;
  action: string;
  quality?: QualityLabel;
  metrics?: RolloutMetrics;
}

/** A rollout session holding Playwright resources and state */
export interface RolloutSession {
  page: Page;
  rolloutDir: string;
  history: IterationSnapshot[];
  bestIter: number;
  stallCount: number;
  currentIter: number;
  totalOverrides: number;
}

/**
 * Create a new rollout session.
 * The caller must provide a Playwright page (browser lifecycle is managed externally).
 */
export function createSession(
  page: Page,
  rolloutDir: string
): RolloutSession {
  return {
    page,
    rolloutDir,
    history: [],
    bestIter: 0,
    stallCount: 0,
    currentIter: 0,
    totalOverrides: 0,
  };
}

/**
 * Initialize a rollout with the initial IR.
 * Renders, extracts DOM, runs diagnostics, writes files, checks stop conditions.
 */
export async function initRollout(
  session: RolloutSession,
  initialIR: IRDocument
): Promise<StepResult> {
  const iter = 0;
  session.currentIter = iter;
  const paths = rolloutPaths(session.rolloutDir, iter);

  // Render
  const html = renderHTML(initialIR);

  // Write IR and HTML
  await writeJSON(paths.ir, initialIR);
  await writeFile(paths.html, html);

  // Extract DOM
  const dom = await extractDOM(session.page, html);

  // Screenshot
  const screenshot = await screenshotSlide(session.page);
  await writeFile(paths.render, screenshot);

  // Write DOM
  await writeJSON(paths.dom, dom);

  // Diagnose
  const diag = diagnose(dom, initialIR);
  await writeJSON(paths.diag, diag);

  // Record snapshot
  const snapshot: IterationSnapshot = {
    iter,
    ir: initialIR,
    diag,
    defectCount: diag.summary.defect_count,
    totalSeverity: diag.summary.total_severity,
    warningCount: diag.summary.warning_count,
  };
  session.history.push(snapshot);

  // Write trace
  const traceEntry: TraceEntry = {
    iter,
    defect_count: diag.summary.defect_count,
    total_severity: diag.summary.total_severity,
    warning_count: diag.summary.warning_count,
    defect_types: [...new Set(diag.defects.map((d) => d.type))],
    warning_types: [...new Set(diag.warnings.map((w) => w.type))],
    action: diag.summary.defect_count === 0 ? "stop_success" : "init",
  };
  await appendTrace(paths.trace, traceEntry);

  // Check stop: success
  if (diag.summary.defect_count === 0) {
    const quality = determineQuality(diag);
    return {
      iter,
      ir: initialIR,
      diag,
      dom,
      stopped: true,
      action: "stop_success",
      quality,
      metrics: buildMetrics(session, quality),
    };
  }

  return {
    iter,
    ir: initialIR,
    diag,
    dom,
    stopped: false,
    action: "init",
  };
}

/**
 * Apply a patch and advance the rollout by one iteration.
 * Applies patch, renders, extracts, diagnoses, checks stop conditions.
 */
export async function stepRollout(
  session: RolloutSession,
  patch: PatchDocument
): Promise<StepResult> {
  const iter = session.currentIter + 1;
  session.currentIter = iter;

  const prevSnapshot = session.history[session.history.length - 1]!;
  const prevIR = prevSnapshot.ir;
  const paths = rolloutPaths(session.rolloutDir, iter);

  // Write patch
  await writeJSON(paths.patch, patch);

  // Apply patch
  const { ir: newIR, overrides } = applyPatch(prevIR, patch);
  session.totalOverrides += overrides.length;

  // Render
  const html = renderHTML(newIR);

  // Write IR and HTML
  await writeJSON(paths.ir, newIR);
  await writeFile(paths.html, html);

  // Extract DOM
  const dom = await extractDOM(session.page, html);

  // Screenshot
  const screenshot = await screenshotSlide(session.page);
  await writeFile(paths.render, screenshot);

  // Write DOM
  await writeJSON(paths.dom, dom);

  // Diagnose
  const diag = diagnose(dom, newIR);
  await writeJSON(paths.diag, diag);

  // Record snapshot
  const snapshot: IterationSnapshot = {
    iter,
    ir: newIR,
    diag,
    defectCount: diag.summary.defect_count,
    totalSeverity: diag.summary.total_severity,
    warningCount: diag.summary.warning_count,
  };
  session.history.push(snapshot);

  // Update best
  const best = session.history[session.bestIter]!;
  if (
    snapshot.totalSeverity < best.totalSeverity ||
    (snapshot.totalSeverity === best.totalSeverity &&
      snapshot.defectCount < best.defectCount)
  ) {
    session.bestIter = session.history.length - 1;
    session.stallCount = 0;
  } else {
    // Check stall: both defect_count and total_severity did not improve
    if (
      snapshot.defectCount >= prevSnapshot.defectCount &&
      snapshot.totalSeverity >= prevSnapshot.totalSeverity
    ) {
      session.stallCount++;
    } else {
      session.stallCount = 0;
    }
  }

  // Build trace entry
  const action = determineAction(session, diag, iter);
  const traceEntry: TraceEntry = {
    iter,
    defect_count: diag.summary.defect_count,
    total_severity: diag.summary.total_severity,
    warning_count: diag.summary.warning_count,
    defect_types: [...new Set(diag.defects.map((d) => d.type))],
    warning_types: [...new Set(diag.warnings.map((w) => w.type))],
    action,
    overrides: overrides.length > 0 ? overrides : undefined,
  };
  await appendTrace(paths.trace, traceEntry);

  // Handle stopping conditions
  if (diag.summary.defect_count === 0) {
    const quality = determineQuality(diag);
    return {
      iter,
      ir: newIR,
      diag,
      dom,
      stopped: true,
      action: "stop_success",
      quality,
      metrics: buildMetrics(session, quality),
    };
  }

  if (session.stallCount >= STALL_THRESHOLD) {
    // Rollback to best
    const bestSnapshot = session.history[session.bestIter]!;
    const quality: QualityLabel = "degraded";
    return {
      iter,
      ir: bestSnapshot.ir,
      diag: bestSnapshot.diag,
      dom,
      stopped: true,
      action: "stop_stall_rollback",
      quality,
      metrics: buildMetrics(session, quality),
    };
  }

  if (iter >= MAX_ITER) {
    // Hard fallback
    const fallbackIR = applyHardFallback(newIR, diag);
    const quality: QualityLabel = "degraded";
    return {
      iter,
      ir: fallbackIR,
      diag,
      dom,
      stopped: true,
      action: "stop_max_iter_fallback",
      quality,
      metrics: buildMetrics(session, quality),
    };
  }

  return {
    iter,
    ir: newIR,
    diag,
    dom,
    stopped: false,
    action: "patch",
  };
}

function determineAction(
  session: RolloutSession,
  diag: DiagDocument,
  iter: number
): string {
  if (diag.summary.defect_count === 0) return "stop_success";
  if (session.stallCount >= STALL_THRESHOLD) return "stop_stall_rollback";
  if (iter >= MAX_ITER) return "stop_max_iter_fallback";
  return "patch";
}

function determineQuality(diag: DiagDocument): QualityLabel {
  if (diag.summary.defect_count === 0 && diag.summary.warning_count === 0) {
    return "success_clean";
  }
  if (diag.summary.defect_count === 0 && diag.summary.warning_count > 0) {
    return "success_with_warnings";
  }
  return "degraded";
}

/**
 * Apply hard fallback to an IR document.
 * Order: truncate → hide (if ALLOW_HIDE) → alert.
 */
function applyHardFallback(
  ir: IRDocument,
  diag: DiagDocument
): IRDocument {
  const fallbackIR: IRDocument = JSON.parse(JSON.stringify(ir));

  // Truncate: apply overflow: hidden + text-overflow: ellipsis to overflowing elements
  const overflowEids = new Set(
    diag.defects
      .filter((d) => d.type === "content_overflow")
      .map((d) => d.eid)
      .filter((eid): eid is string => eid != null)
  );

  for (const el of fallbackIR.elements) {
    if (overflowEids.has(el.eid)) {
      (el.style as Record<string, unknown>)["overflow"] = "hidden";
      (el.style as Record<string, unknown>)["textOverflow"] = "ellipsis";
    }
  }

  // Hide: if ALLOW_HIDE, hide lowest priority element still causing issues
  if (ALLOW_HIDE) {
    const problemEids = new Set(
      diag.defects
        .flatMap((d) => [d.eid, d.owner_eid])
        .filter((eid): eid is string => eid != null)
    );

    // Sort by priority ascending, prefer decoration then image
    const candidates = fallbackIR.elements
      .filter((el) => problemEids.has(el.eid))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        const typeOrder = { decoration: 0, image: 1, text: 2, bullets: 3, title: 4 };
        return (
          (typeOrder[a.type] ?? 5) - (typeOrder[b.type] ?? 5)
        );
      });

    if (candidates.length > 0) {
      const target = candidates[0]!;
      (target.style as Record<string, unknown>)["display"] = "none";
    }
  }

  return fallbackIR;
}

function buildMetrics(
  session: RolloutSession,
  quality: QualityLabel
): RolloutMetrics {
  const lastSnapshot = session.history[session.history.length - 1]!;
  return {
    defect_count_per_iter: session.history.map((s) => s.defectCount),
    total_severity_per_iter: session.history.map((s) => s.totalSeverity),
    warning_count_per_iter: session.history.map((s) => s.warningCount),
    iterations_to_converge: session.currentIter,
    final_defect_types: [
      ...new Set(lastSnapshot.diag.defects.map((d) => d.type)),
    ],
    final_warning_types: [
      ...new Set(lastSnapshot.diag.warnings.map((w) => w.type)),
    ],
    quality,
    budget_overrides: session.totalOverrides,
  };
}
