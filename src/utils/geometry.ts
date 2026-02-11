import type { Rect } from "../schema/dom.js";
import { SLIDE_W, SLIDE_H, SAFE_PADDING } from "../constants.js";

/** Inflate a rect by `padding` on each side */
export function inflateRect(r: Rect, padding: number = SAFE_PADDING): Rect {
  return {
    x: r.x - padding,
    y: r.y - padding,
    w: r.w + padding * 2,
    h: r.h + padding * 2,
  };
}

/** Compute the intersection of two rects, or null if they don't intersect */
export function intersectRects(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  const w = right - x;
  const h = bottom - y;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/** Compute the area of intersection between two rects */
export function intersectionArea(a: Rect, b: Rect): number {
  const inter = intersectRects(a, b);
  if (!inter) return 0;
  return inter.w * inter.h;
}

/** Clamp a rect to fit within the slide bounds. Adjusts position first, then size. */
export function clampToSlide(
  r: Rect,
  slideW: number = SLIDE_W,
  slideH: number = SLIDE_H
): Rect {
  let { x, y, w, h } = r;
  // Clamp width/height to slide dimensions
  w = Math.min(w, slideW);
  h = Math.min(h, slideH);
  // Clamp position
  x = Math.max(0, Math.min(x, slideW - w));
  y = Math.max(0, Math.min(y, slideH - h));
  return { x, y, w, h };
}

/** Out-of-bounds edge info */
export interface OOBEdge {
  edge: "left" | "right" | "top" | "bottom";
  by_px: number;
}

/** Check which edges of a rect exceed slide bounds beyond eps tolerance */
export function oobEdges(
  r: Rect,
  eps: number,
  slideW: number = SLIDE_W,
  slideH: number = SLIDE_H
): OOBEdge[] {
  const edges: OOBEdge[] = [];
  if (r.x < -eps) {
    edges.push({ edge: "left", by_px: Math.abs(r.x) });
  }
  if (r.y < -eps) {
    edges.push({ edge: "top", by_px: Math.abs(r.y) });
  }
  if (r.x + r.w > slideW + eps) {
    edges.push({ edge: "right", by_px: r.x + r.w - slideW });
  }
  if (r.y + r.h > slideH + eps) {
    edges.push({ edge: "bottom", by_px: r.y + r.h - slideH });
  }
  return edges;
}

/** Check if a rect is within slide bounds (with tolerance) */
export function isInBounds(
  r: Rect,
  eps: number = 0,
  slideW: number = SLIDE_W,
  slideH: number = SLIDE_H
): boolean {
  return oobEdges(r, eps, slideW, slideH).length === 0;
}

/** Compute the union bounding box of multiple rects */
export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Compute the area of a rect */
export function rectArea(r: Rect): number {
  return r.w * r.h;
}
