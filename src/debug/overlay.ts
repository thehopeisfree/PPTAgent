/**
 * Tool A: Playwright-injected debug overlay.
 *
 * Injects an SVG directly into the live browser page on top of #slide.
 * Coordinates are 100% aligned with the render — zero deviation.
 *
 * Usage:
 *   await injectDebugOverlay(page, dom);
 *   await injectDebugOverlay(page, dom, { diag, layers: ["bbox", "contentBox"] });
 *   await toggleLayer(page, "safeBox", false);
 *   const png = await screenshotSlide(page);  // overlay included
 */

import type { Page } from "playwright";
import type { DOMDocument, Rect } from "../schema/dom.js";
import type { DiagDocument } from "../schema/diag.js";
import { intersectRects } from "../utils/geometry.js";

export type OverlayLayer = "bbox" | "safeBox" | "contentBox";

export interface OverlayOptions {
  layers?: OverlayLayer[];
  diag?: DiagDocument;
}

// Flat SVG primitive — all optional fields, discriminated by `tag`.
// Kept flat so it serializes cleanly through page.evaluate().
interface SvgPrimitive {
  tag: "rect" | "line" | "text";
  layer: string;
  eid?: string;
  // rect / shared position
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  // line endpoints
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  // style
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  dashArray?: string;
  // text
  text?: string;
  fontSize?: number;
}

function buildPrimitives(
  dom: DOMDocument,
  layers: OverlayLayer[],
  diag?: DiagDocument,
): SvgPrimitive[] {
  const prims: SvgPrimitive[] = [];

  for (const el of dom.elements) {
    // EID label above bbox
    prims.push({
      tag: "text",
      layer: "label",
      x: el.bbox.x + 2,
      y: el.bbox.y - 3,
      text: el.eid,
      fill: "#22c55e",
      fontSize: 10,
    });

    // bbox — green solid
    if (layers.includes("bbox")) {
      prims.push({
        tag: "rect",
        layer: "bbox",
        eid: el.eid,
        x: el.bbox.x,
        y: el.bbox.y,
        w: el.bbox.w,
        h: el.bbox.h,
        stroke: "#22c55e",
        strokeWidth: 1,
        fill: "none",
      });
    }

    // safeBox — orange dashed
    if (layers.includes("safeBox")) {
      prims.push({
        tag: "rect",
        layer: "safeBox",
        eid: el.eid,
        x: el.safeBox.x,
        y: el.safeBox.y,
        w: el.safeBox.w,
        h: el.safeBox.h,
        stroke: "#f97316",
        strokeWidth: 1,
        fill: "none",
        dashArray: "6,3",
      });
    }

    // contentBox — pink dotted (red if overflow)
    if (layers.includes("contentBox") && el.contentBox) {
      const hasOverflow = diag?.defects.some(
        (d) =>
          d.type === "content_overflow" &&
          (d.eid === el.eid || d.owner_eid === el.eid),
      );
      prims.push({
        tag: "rect",
        layer: "contentBox",
        eid: el.eid,
        x: el.contentBox.x,
        y: el.contentBox.y,
        w: el.contentBox.w,
        h: el.contentBox.h,
        stroke: hasOverflow ? "#ef4444" : "#ec4899",
        strokeWidth: hasOverflow ? 2 : 1,
        fill: "none",
        dashArray: "3,2",
      });
    }
  }

  if (diag) {
    addDefectPrimitives(prims, dom, diag);
    addSummaryPrimitives(prims, diag);
  }

  return prims;
}

function addDefectPrimitives(
  prims: SvgPrimitive[],
  dom: DOMDocument,
  diag: DiagDocument,
): void {
  const slideW = dom.slide.w;
  const slideH = dom.slide.h;

  for (const defect of diag.defects) {
    // Overlap zones — yellow semi-transparent
    if (defect.type === "overlap") {
      const owner = dom.elements.find((e) => e.eid === defect.owner_eid);
      const other = dom.elements.find((e) => e.eid === defect.other_eid);
      if (owner && other) {
        const inter = intersectRects(owner.safeBox, other.safeBox);
        if (inter) {
          prims.push({
            tag: "rect",
            layer: "defect",
            x: inter.x,
            y: inter.y,
            w: inter.w,
            h: inter.h,
            stroke: "#eab308",
            strokeWidth: 1,
            fill: "rgba(234,179,8,0.3)",
          });
        }
      }
    }

    // Content overflow — red tint on element bbox
    if (defect.type === "content_overflow") {
      const eid = defect.eid ?? defect.owner_eid;
      const domEl = dom.elements.find((e) => e.eid === eid);
      if (domEl) {
        prims.push({
          tag: "rect",
          layer: "defect",
          x: domEl.bbox.x,
          y: domEl.bbox.y,
          w: domEl.bbox.w,
          h: domEl.bbox.h,
          stroke: "#ef4444",
          strokeWidth: 2,
          fill: "rgba(239,68,68,0.12)",
        });
      }
    }

    // OOB edges — red line on violated slide boundary
    if (defect.type === "out_of_bounds") {
      const details = defect.details as { edge: string };
      let lx1 = 0,
        ly1 = 0,
        lx2 = 0,
        ly2 = 0;
      switch (details.edge) {
        case "left":
          lx2 = 0;
          ly2 = slideH;
          break;
        case "right":
          lx1 = slideW;
          lx2 = slideW;
          ly2 = slideH;
          break;
        case "top":
          lx2 = slideW;
          break;
        case "bottom":
          ly1 = slideH;
          lx2 = slideW;
          ly2 = slideH;
          break;
      }
      prims.push({
        tag: "line",
        layer: "defect",
        x1: lx1,
        y1: ly1,
        x2: lx2,
        y2: ly2,
        stroke: "#ef4444",
        strokeWidth: 3,
      });
    }
  }
}

function addSummaryPrimitives(
  prims: SvgPrimitive[],
  diag: DiagDocument,
): void {
  const s = diag.summary;
  const lines = [
    `Defects: ${s.defect_count}  Severity: ${s.total_severity}  Warnings: ${s.warning_count}`,
  ];
  if (s.conflict_chain && s.conflict_chain.length > 0) {
    lines.push(`Chain: ${s.conflict_chain.join(" \u2192 ")}`);
  }

  const lineH = 16;
  const padX = 8;
  const padY = 6;
  const textW = Math.max(...lines.map((l) => l.length * 7)) + padX * 2;
  const textH = lines.length * lineH + padY * 2;

  prims.push({
    tag: "rect",
    layer: "summary",
    x: 4,
    y: 4,
    w: textW,
    h: textH,
    stroke: "none",
    strokeWidth: 0,
    fill: "rgba(0,0,0,0.75)",
  });

  for (let i = 0; i < lines.length; i++) {
    prims.push({
      tag: "text",
      layer: "summary",
      x: 4 + padX,
      y: 4 + padY + 12 + i * lineH,
      text: lines[i]!,
      fill: "#ffffff",
      fontSize: 11,
    });
  }
}

// Browser-side injection script. Evaluated as a string to avoid
// needing "dom" in tsconfig lib (same pattern as dom-extractor.ts).
const INJECT_SCRIPT = `((prims, slideW, slideH) => {
  var old = document.getElementById("debug-overlay");
  if (old) old.remove();

  var slide = document.getElementById("slide");
  if (!slide) return;

  var ns = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(ns, "svg");
  svg.id = "debug-overlay";
  svg.setAttribute("width", String(slideW));
  svg.setAttribute("height", String(slideH));
  svg.setAttribute("viewBox", "0 0 " + slideW + " " + slideH);
  svg.style.position = "absolute";
  svg.style.top = "0";
  svg.style.left = "0";
  svg.style.pointerEvents = "none";
  svg.style.zIndex = "99999";

  for (var i = 0; i < prims.length; i++) {
    var p = prims[i];
    if (p.tag === "rect") {
      var r = document.createElementNS(ns, "rect");
      r.setAttribute("data-layer", p.layer);
      if (p.eid) r.setAttribute("data-eid", p.eid);
      r.setAttribute("x", String(p.x || 0));
      r.setAttribute("y", String(p.y || 0));
      r.setAttribute("width", String(p.w || 0));
      r.setAttribute("height", String(p.h || 0));
      r.setAttribute("fill", p.fill || "none");
      r.setAttribute("stroke", p.stroke || "none");
      r.setAttribute("stroke-width", String(p.strokeWidth || 1));
      if (p.dashArray) r.setAttribute("stroke-dasharray", p.dashArray);
      svg.appendChild(r);
    } else if (p.tag === "line") {
      var l = document.createElementNS(ns, "line");
      l.setAttribute("data-layer", p.layer);
      l.setAttribute("x1", String(p.x1 || 0));
      l.setAttribute("y1", String(p.y1 || 0));
      l.setAttribute("x2", String(p.x2 || 0));
      l.setAttribute("y2", String(p.y2 || 0));
      l.setAttribute("stroke", p.stroke || "#ef4444");
      l.setAttribute("stroke-width", String(p.strokeWidth || 1));
      svg.appendChild(l);
    } else if (p.tag === "text") {
      var t = document.createElementNS(ns, "text");
      t.setAttribute("data-layer", p.layer);
      t.setAttribute("x", String(p.x || 0));
      t.setAttribute("y", String(p.y || 0));
      t.setAttribute("fill", p.fill || "#fff");
      t.setAttribute("font-size", String(p.fontSize || 11));
      t.setAttribute("font-family", "monospace");
      t.textContent = p.text || "";
      svg.appendChild(t);
    }
  }

  slide.appendChild(svg);
})`;

/**
 * Inject an SVG debug overlay into the Playwright page.
 * The overlay is appended inside `#slide` so `screenshotSlide()` captures it.
 */
export async function injectDebugOverlay(
  page: Page,
  dom: DOMDocument,
  options?: OverlayOptions,
): Promise<void> {
  const layers = options?.layers ?? ["bbox", "safeBox", "contentBox"];
  const prims = buildPrimitives(dom, layers, options?.diag);
  const slideW = dom.slide.w;
  const slideH = dom.slide.h;

  const primsJSON = JSON.stringify(prims);
  const script = `${INJECT_SCRIPT}(${primsJSON}, ${slideW}, ${slideH})`;
  await page.evaluate(script);
}

/** Toggle visibility of a named overlay layer. */
export async function toggleLayer(
  page: Page,
  layer: string,
  visible: boolean,
): Promise<void> {
  const display = visible ? "" : "none";
  const script = `(() => {
    var svg = document.getElementById("debug-overlay");
    if (!svg) return;
    var els = svg.querySelectorAll('[data-layer="${layer}"]');
    for (var i = 0; i < els.length; i++) els[i].style.display = "${display}";
  })()`;
  await page.evaluate(script);
}

/** Remove the debug overlay from the page. */
export async function removeDebugOverlay(page: Page): Promise<void> {
  await page.evaluate(
    `(() => { var el = document.getElementById("debug-overlay"); if (el) el.remove(); })()`,
  );
}
