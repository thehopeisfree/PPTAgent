import type { Page } from "playwright";
import type { DOMDocument, DOMElement, Rect } from "../schema/dom.js";
import { SAFE_PADDING } from "../constants.js";
import { inflateRect } from "../utils/geometry.js";

/**
 * JavaScript string evaluated in the browser context via page.evaluate().
 * Uses Range API getClientRects() union for contentBox (NOT scrollHeight).
 * All coordinates are slide-local (subtract #slide offset).
 * Wrapped as an IIFE so page.evaluate() executes and returns the result.
 */
const EXTRACTION_SCRIPT = `(() => {
  const slide = document.querySelector('#slide');
  if (!slide) throw new Error('No #slide element found');
  const slideRect = slide.getBoundingClientRect();

  const elements = document.querySelectorAll('[data-eid]');
  const results = [];

  for (const el of elements) {
    const eid = el.getAttribute('data-eid');
    const elRect = el.getBoundingClientRect();

    const bbox = {
      x: elRect.x - slideRect.x,
      y: elRect.y - slideRect.y,
      w: elRect.width,
      h: elRect.height,
    };

    let contentBox = null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects());
    if (rects.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const r of rects) {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width);
        maxY = Math.max(maxY, r.y + r.height);
      }
      contentBox = {
        x: minX - slideRect.x,
        y: minY - slideRect.y,
        w: maxX - minX,
        h: maxY - minY,
      };
    }

    const computed = window.getComputedStyle(el);
    const fontSize = parseFloat(computed.fontSize) || 16;
    const lineHeightRaw = computed.lineHeight;
    let lineHeight;
    if (lineHeightRaw === 'normal') {
      lineHeight = 1.2;
    } else if (lineHeightRaw.endsWith('px')) {
      lineHeight = parseFloat(lineHeightRaw) / fontSize;
    } else {
      lineHeight = parseFloat(lineHeightRaw) || 1.2;
    }

    const zIndex = parseInt(computed.zIndex, 10) || 0;

    results.push({
      eid,
      bbox,
      contentBox,
      zIndex,
      computed: { fontSize, lineHeight },
    });
  }

  return {
    slideW: slideRect.width,
    slideH: slideRect.height,
    elements: results,
  };
})()`;

interface RawExtractionResult {
  slideW: number;
  slideH: number;
  elements: Array<{
    eid: string;
    bbox: Rect;
    contentBox: Rect | null;
    zIndex: number;
    computed: { fontSize: number; lineHeight: number };
  }>;
}

function buildDOMDocument(raw: RawExtractionResult): DOMDocument {
  const elements: DOMElement[] = raw.elements.map((el) => ({
    eid: el.eid,
    bbox: el.bbox,
    safeBox: inflateRect(el.bbox, SAFE_PADDING),
    contentBox: el.contentBox,
    zIndex: el.zIndex,
    computed: el.computed,
  }));

  return {
    slide: { w: raw.slideW, h: raw.slideH },
    safe_padding: SAFE_PADDING,
    elements,
  };
}

/**
 * Extract DOM measurements from a Playwright page that already has content loaded.
 * The page must contain a `#slide` element with `[data-eid]` children.
 */
export async function extractDOMWithPage(page: Page): Promise<DOMDocument> {
  const raw = (await page.evaluate(EXTRACTION_SCRIPT)) as RawExtractionResult;
  return buildDOMDocument(raw);
}

/**
 * Load HTML into a Playwright page and extract DOM measurements.
 * Creates a fresh page content context.
 */
export async function extractDOM(
  page: Page,
  html: string
): Promise<DOMDocument> {
  await page.setContent(html, { waitUntil: "load" });
  return extractDOMWithPage(page);
}

/**
 * Take a screenshot of the #slide element.
 * Returns a Buffer of the PNG image.
 */
export async function screenshotSlide(page: Page): Promise<Buffer> {
  const slide = page.locator("#slide");
  return (await slide.screenshot({ type: "png" })) as Buffer;
}
