import type { Page } from "playwright";
import type { IRDocument, IRElement, ElementType } from "../schema/ir.js";
import type { DOMDocument, DOMElement } from "../schema/dom.js";
import { SLIDE_W, SLIDE_H, DEFAULT_Z_INDEX } from "../constants.js";

// ── Type signals extracted from the browser ─────────────────────────

/** Structural signals for a single data-eid element, extracted in-browser. */
export interface TypeSignal {
  eid: string;
  /** Contains an <img> child */
  hasImg: boolean;
  /** Contains a <ul> or <ol> child */
  hasList: boolean;
  /** Has non-whitespace text content */
  hasText: boolean;
  /** Has a visible background (color, gradient, or image) */
  hasBg: boolean;
  /** Computed font-weight (numeric, e.g. 400, 700) */
  fontWeight: number;
}

/**
 * Browser-side script that inspects each [data-eid] element and returns
 * structural signals for type inference. Runs after the page is loaded.
 */
const TYPE_SIGNAL_SCRIPT = `(() => {
  const results = [];
  for (const el of document.querySelectorAll('[data-eid]')) {
    const eid = el.getAttribute('data-eid');
    const hasImg = el.querySelector('img') !== null;
    const hasList = el.querySelector('ul, ol') !== null;

    // Check for non-whitespace text (exclude img alt text)
    const clone = el.cloneNode(true);
    for (const img of clone.querySelectorAll('img')) img.remove();
    const hasText = clone.textContent.trim().length > 0;

    // Check background (color, gradient, or image)
    const computed = window.getComputedStyle(el);
    const bg = computed.backgroundColor;
    const bgImg = computed.backgroundImage;
    const hasBg = (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent')
               || (bgImg !== 'none' && bgImg !== '');

    // Font weight (always numeric in computed style)
    const fontWeight = parseInt(window.getComputedStyle(el).fontWeight, 10) || 400;

    results.push({ eid, hasImg, hasList, hasText, hasBg, fontWeight });
  }
  return results;
})()`;

// ── Pure inference functions ────────────────────────────────────────

/**
 * Infer element type from structural signals and computed styles.
 *
 * Rules (evaluated in order):
 *   1. Has <img>, no text → "image"
 *   2. Has <ul>/<ol>      → "bullets"
 *   3. No text, has bg    → "decoration"
 *   4. Bold + large font  → "title"
 *   5. Fallback           → "text"
 */
export function inferType(signal: TypeSignal, domEl: DOMElement): ElementType {
  if (signal.hasImg && !signal.hasText) return "image";
  if (signal.hasList) return "bullets";
  if (!signal.hasText && signal.hasBg) return "decoration";
  if (signal.fontWeight >= 700 && domEl.computed.fontSize >= 28) return "title";
  return "text";
}

/**
 * Default priority for an inferred element type.
 *
 * Aligns with MIN_FONT_BY_PRIORITY thresholds:
 *   title (100) → min 32px
 *   text/bullets (60) → min 16px
 *   image (50) → font check skipped
 *   decoration (0) → all checks skipped
 */
export function inferPriority(type: ElementType): number {
  switch (type) {
    case "title":
      return 100;
    case "text":
    case "bullets":
      return 60;
    case "image":
      return 50;
    case "decoration":
      return 0;
  }
}

// ── Composition ─────────────────────────────────────────────────────

/**
 * Build an IRDocument from DOM extraction data and type signals.
 * Pure function — no browser interaction.
 */
export function inferIRFromDOM(
  dom: DOMDocument,
  signals: TypeSignal[],
): IRDocument {
  const signalMap = new Map<string, TypeSignal>();
  for (const s of signals) signalMap.set(s.eid, s);

  const elements: IRElement[] = dom.elements.map((domEl) => {
    const signal = signalMap.get(domEl.eid);
    const type = signal ? inferType(signal, domEl) : "text";
    const priority = inferPriority(type);

    return {
      eid: domEl.eid,
      type,
      priority,
      content: "",
      layout: {
        x: domEl.bbox.x,
        y: domEl.bbox.y,
        w: domEl.bbox.w,
        h: domEl.bbox.h,
        zIndex: domEl.zIndex || DEFAULT_Z_INDEX,
      },
      style: {
        fontSize: domEl.computed.fontSize,
        lineHeight: domEl.computed.lineHeight,
      },
    };
  });

  return {
    slide: { w: dom.slide?.w ?? SLIDE_W, h: dom.slide?.h ?? SLIDE_H },
    elements,
  };
}

/**
 * Extract type signals from a loaded Playwright page.
 * The page must already have HTML content with [data-eid] elements.
 */
export async function extractTypeSignals(page: Page): Promise<TypeSignal[]> {
  return (await page.evaluate(TYPE_SIGNAL_SCRIPT)) as TypeSignal[];
}

/**
 * Convenience: extract type signals from browser + build IR in one call.
 * Use after extractDOM() — the page must still have the HTML loaded.
 */
export async function inferIR(
  page: Page,
  dom: DOMDocument,
): Promise<IRDocument> {
  const signals = await extractTypeSignals(page);
  return inferIRFromDOM(dom, signals);
}
