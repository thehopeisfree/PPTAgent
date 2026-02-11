import type { IRDocument, IRElement } from "../schema/ir.js";
import { SLIDE_W, SLIDE_H } from "../constants.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildStyleString(el: IRElement): string {
  const { layout, style } = el;
  const parts: string[] = [
    "position: absolute",
    "box-sizing: border-box",
    `left: ${layout.x}px`,
    `top: ${layout.y}px`,
    `width: ${layout.w}px`,
    `height: ${layout.h}px`,
    `z-index: ${layout.zIndex}`,
    "overflow: visible",
  ];

  if (style.fontSize != null) parts.push(`font-size: ${style.fontSize}px`);
  if (style.lineHeight != null) parts.push(`line-height: ${style.lineHeight}`);
  if (style.backgroundColor != null)
    parts.push(`background-color: ${style.backgroundColor}`);
  if (style.color != null) parts.push(`color: ${style.color}`);
  if (style.fontWeight != null) parts.push(`font-weight: ${style.fontWeight}`);
  if (style.fontFamily != null) parts.push(`font-family: ${style.fontFamily}`);
  if (style.textAlign != null) parts.push(`text-align: ${style.textAlign}`);
  if (style.borderRadius != null)
    parts.push(`border-radius: ${style.borderRadius}px`);
  if (style.opacity != null) parts.push(`opacity: ${style.opacity}`);

  return parts.join("; ");
}

function renderBullets(content: string): string {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const items = lines
    .map((line) => {
      const text = line.replace(/^[•\-\*]\s*/, "");
      return `<li>${escapeHtml(text)}</li>`;
    })
    .join("");
  return `<ul style="margin: 0; padding-left: 1.5em; list-style-type: disc">${items}</ul>`;
}

function renderElement(el: IRElement): string {
  const styleStr = buildStyleString(el);
  const dataAttrs = `data-eid="${escapeHtml(el.eid)}"`;

  switch (el.type) {
    case "image": {
      const objectFit =
        (el.style.objectFit as string | undefined) ?? "contain";
      return `<div ${dataAttrs} style="${styleStr}"><img src="${escapeHtml(el.content)}" style="width: 100%; height: 100%; object-fit: ${objectFit}" alt="" /></div>`;
    }
    case "bullets":
      return `<div ${dataAttrs} style="${styleStr}">${renderBullets(el.content)}</div>`;
    case "decoration":
      return `<div ${dataAttrs} style="${styleStr}">${escapeHtml(el.content)}</div>`;
    default:
      // title, text
      return `<div ${dataAttrs} style="${styleStr}">${escapeHtml(el.content)}</div>`;
  }
}

/** Render an IR document to a full HTML string for Playwright */
export function renderHTML(ir: IRDocument): string {
  const slideW = ir.slide.w ?? SLIDE_W;
  const slideH = ir.slide.h ?? SLIDE_H;

  const elements = ir.elements.map(renderElement).join("\n    ");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; }
    body { background: #fff; }
    #slide {
      position: relative;
      width: ${slideW}px;
      height: ${slideH}px;
      overflow: hidden;
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
    }
  </style>
</head>
<body>
  <div id="slide">
    ${elements}
  </div>
</body>
</html>`;
}
