import type { Page } from "playwright";
import { SLIDE_W, SLIDE_H } from "../constants.js";

/**
 * Extracted element info from a rendered flexbox HTML slide.
 * All coordinates are slide-local (relative to #slide top-left).
 */
export interface FlattenedElement {
  eid: string;
  bbox: { x: number; y: number; w: number; h: number };
  innerHTML: string;
  computed: {
    fontSize: number;
    lineHeight: number;
    color: string;
    backgroundColor: string;
    fontWeight: string;
    fontFamily: string;
    textAlign: string;
    borderRadius: string;
    opacity: number;
    zIndex: number;
  };
}

/**
 * Browser-side extraction script. Extracts bounding boxes, innerHTML,
 * and computed styles for all [data-eid] elements relative to #slide.
 */
const FLATTEN_SCRIPT = `(() => {
  const slide = document.querySelector('#slide');
  if (!slide) throw new Error('No #slide element found');
  const slideRect = slide.getBoundingClientRect();

  const elements = document.querySelectorAll('[data-eid]');
  const results = [];

  for (const el of elements) {
    const eid = el.getAttribute('data-eid');
    const rect = el.getBoundingClientRect();
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

    results.push({
      eid,
      bbox: {
        x: Math.round(rect.x - slideRect.x),
        y: Math.round(rect.y - slideRect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      innerHTML: el.innerHTML,
      computed: {
        fontSize,
        lineHeight: Math.round(lineHeight * 100) / 100,
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontWeight: computed.fontWeight,
        fontFamily: computed.fontFamily,
        textAlign: computed.textAlign,
        borderRadius: computed.borderRadius,
        opacity: parseFloat(computed.opacity) || 1,
        zIndex: parseInt(computed.zIndex, 10) || 0,
      },
    });
  }

  return results;
})()`;

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Build an absolute-positioned style string from extracted computed styles.
 */
function buildAbsoluteStyle(el: FlattenedElement): string {
  const { bbox, computed } = el;
  const parts: string[] = [
    "position: absolute",
    "box-sizing: border-box",
    `left: ${bbox.x}px`,
    `top: ${bbox.y}px`,
    `width: ${bbox.w}px`,
    `height: ${bbox.h}px`,
    `z-index: ${computed.zIndex}`,
    "overflow: visible",
  ];

  if (computed.fontSize) parts.push(`font-size: ${computed.fontSize}px`);
  if (computed.lineHeight) parts.push(`line-height: ${computed.lineHeight}`);
  if (computed.color && computed.color !== "rgb(0, 0, 0)")
    parts.push(`color: ${computed.color}`);
  if (
    computed.backgroundColor &&
    computed.backgroundColor !== "rgba(0, 0, 0, 0)" &&
    computed.backgroundColor !== "transparent"
  )
    parts.push(`background-color: ${computed.backgroundColor}`);
  if (computed.fontWeight && computed.fontWeight !== "400")
    parts.push(`font-weight: ${computed.fontWeight}`);
  if (computed.textAlign && computed.textAlign !== "start")
    parts.push(`text-align: ${computed.textAlign}`);
  if (computed.borderRadius && computed.borderRadius !== "0px")
    parts.push(`border-radius: ${computed.borderRadius}`);
  if (computed.opacity !== 1) parts.push(`opacity: ${computed.opacity}`);

  return parts.join("; ");
}

/**
 * Flatten flexbox HTML to absolute-positioned HTML.
 *
 * Takes any HTML with a `#slide` container and `[data-eid]` elements
 * (which may use flexbox, grid, or any CSS layout), renders it in
 * Playwright, and produces equivalent HTML where every element uses
 * `position: absolute` with computed coordinates.
 *
 * This is the bridge between model-generated flexbox HTML and the
 * diagnostics pipeline that requires absolute positioning.
 *
 * @param page - Playwright page (must be open, will set content)
 * @param html - The source HTML (flexbox or any layout)
 * @returns Absolute-positioned HTML string
 */
export async function flattenHTML(
  page: Page,
  html: string
): Promise<{ html: string; elements: FlattenedElement[] }> {
  await page.setContent(html, { waitUntil: "load" });
  const elements = (await page.evaluate(
    FLATTEN_SCRIPT
  )) as FlattenedElement[];

  const elementDivs = elements
    .map((el) => {
      const style = buildAbsoluteStyle(el);
      return `    <div data-eid="${escapeAttr(el.eid)}" style="${style}">${el.innerHTML}</div>`;
    })
    .join("\n");

  const absoluteHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; }
    body { background: #fff; }
    #slide {
      position: relative;
      width: ${SLIDE_W}px;
      height: ${SLIDE_H}px;
      overflow: hidden;
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
    }
  </style>
</head>
<body>
  <div id="slide">
${elementDivs}
  </div>
</body>
</html>`;

  return { html: absoluteHtml, elements };
}
