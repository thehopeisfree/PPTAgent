import type { Page } from "playwright";
import { SLIDE_W, SLIDE_H } from "../constants.js";

/**
 * Conversion factor: slide pixels → PowerPoint inches.
 * Standard PowerPoint 16:9 is 10" × 5.625".
 * Our slide is 1280×720 px, so:
 *   1280px = 10"   → 1px = 10/1280 = 0.0078125"
 *   720px = 5.625" → 1px = 5.625/720 = 0.0078125"
 * Conveniently the same ratio in both axes.
 */
const PPTX_SLIDE_W = 10; // inches
const PPTX_SLIDE_H = 5.625; // inches
const PX_TO_INCH = PPTX_SLIDE_W / SLIDE_W; // 0.0078125

/** Font size conversion: CSS px → PowerPoint pt. 1px ≈ 0.75pt */
const PX_TO_PT = 0.75;

/**
 * Browser-side extraction script for PPTX conversion.
 * Extracts element data-eid, bounding boxes, text content, and styles.
 */
const PPTX_EXTRACT_SCRIPT = `(() => {
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

    // Detect if element has bullet list
    const hasList = el.querySelector('ul, ol') !== null;
    let bulletItems = [];
    if (hasList) {
      const listItems = el.querySelectorAll('li');
      bulletItems = Array.from(listItems).map(li => li.textContent.trim());
    }

    // Detect if element is an image wrapper
    const img = el.querySelector('img');
    const imgSrc = img ? img.getAttribute('src') || '' : '';

    // Get plain text content (excluding nested elements' redundant text)
    const textContent = hasList ? '' : (img ? '' : el.textContent.trim());

    results.push({
      eid,
      bbox: {
        x: Math.round(rect.x - slideRect.x),
        y: Math.round(rect.y - slideRect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      zIndex: parseInt(computed.zIndex, 10) || 0,
      hasList,
      bulletItems,
      imgSrc,
      textContent,
      style: {
        fontSize,
        lineHeight: Math.round(lineHeight * 100) / 100,
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontWeight: computed.fontWeight,
        fontFamily: computed.fontFamily,
        textAlign: computed.textAlign,
        borderRadius: parseFloat(computed.borderRadius) || 0,
        opacity: parseFloat(computed.opacity) || 1,
      },
    });
  }

  return results;
})()`;

interface RawExtracted {
  eid: string;
  bbox: { x: number; y: number; w: number; h: number };
  zIndex: number;
  hasList: boolean;
  bulletItems: string[];
  imgSrc: string;
  textContent: string;
  style: {
    fontSize: number;
    lineHeight: number;
    color: string;
    backgroundColor: string;
    fontWeight: string;
    fontFamily: string;
    textAlign: string;
    borderRadius: number;
    opacity: number;
  };
}

/**
 * Parse a CSS color string (rgb/rgba/hex) to a 6-char hex string (no #).
 * Returns undefined if transparent or unparseable.
 */
function cssColorToHex(color: string): string | undefined {
  if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") {
    return undefined;
  }

  // Already hex
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    return hex.slice(0, 6);
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const match = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/
  );
  if (match) {
    const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
    if (a === 0) return undefined; // fully transparent
    const r = parseInt(match[1]!, 10);
    const g = parseInt(match[2]!, 10);
    const b = parseInt(match[3]!, 10);
    return [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  return undefined;
}

/**
 * Classify element type based on eid and content.
 */
function classifyElement(raw: RawExtracted): "title" | "text" | "bullets" | "image" | "decoration" {
  if (raw.imgSrc) return "image";
  if (raw.hasList) return "bullets";

  // Decoration: no text content, has background, or zIndex 0
  if (
    !raw.textContent &&
    !raw.hasList &&
    !raw.imgSrc &&
    raw.style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
    raw.style.backgroundColor !== "transparent"
  ) {
    return "decoration";
  }

  // Title heuristic: large font, bold, or eid contains "title"
  if (
    raw.eid.includes("title") ||
    (raw.style.fontSize >= 28 &&
      (raw.style.fontWeight === "700" || raw.style.fontWeight === "bold"))
  ) {
    return "title";
  }

  return "text";
}

/**
 * Convert absolute-positioned HTML to a PptxGenJS presentation.
 *
 * Renders the HTML in Playwright, extracts elements, and creates
 * a PPTX slide with matching text, shapes, and images.
 *
 * @param page - Playwright page (will set content)
 * @param html - Absolute-positioned HTML with #slide and data-eid elements
 * @returns PptxGenJS presentation object (call writeFile or write to save)
 */
export async function htmlToPptx(
  page: Page,
  html: string
): Promise<unknown> {
  // PptxGenJS has quirky type exports (namespace + default class).
  // The runtime default export IS the class constructor, but TS doesn't see it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PptxGenJSModule = await import("pptxgenjs");
  const PptxGenJS = PptxGenJSModule.default as unknown as new () => Record<string, any>;
  await page.setContent(html, { waitUntil: "load" });
  const rawElements = (await page.evaluate(
    PPTX_EXTRACT_SCRIPT
  )) as RawExtracted[];

  const pres = new PptxGenJS();
  pres.defineLayout({
    name: "SLIDE_1280x720",
    width: PPTX_SLIDE_W,
    height: PPTX_SLIDE_H,
  });
  pres.layout = "SLIDE_1280x720";

  const slide = pres.addSlide();

  // Sort by zIndex so lower elements are added first
  const sorted = [...rawElements].sort((a, b) => a.zIndex - b.zIndex);

  for (const raw of sorted) {
    const elType = classifyElement(raw);
    const x = raw.bbox.x * PX_TO_INCH;
    const y = raw.bbox.y * PX_TO_INCH;
    const w = raw.bbox.w * PX_TO_INCH;
    const h = raw.bbox.h * PX_TO_INCH;

    const fontSizePt = Math.round(raw.style.fontSize * PX_TO_PT);
    const fontColor = cssColorToHex(raw.style.color);
    const bgColor = cssColorToHex(raw.style.backgroundColor);
    const isBold =
      raw.style.fontWeight === "700" || raw.style.fontWeight === "bold";
    const fontFace = cleanFontFamily(raw.style.fontFamily);
    const align = mapTextAlign(raw.style.textAlign);

    switch (elType) {
      case "decoration": {
        const shapeOpts: Record<string, unknown> = { x, y, w, h };
        if (bgColor) {
          shapeOpts.fill = { color: bgColor };
        }
        if (raw.style.opacity < 1) {
          shapeOpts.fill = {
            color: bgColor ?? "FFFFFF",
            transparency: Math.round((1 - raw.style.opacity) * 100),
          };
        }
        if (raw.style.borderRadius > 0) {
          shapeOpts.rectRadius = raw.style.borderRadius * PX_TO_INCH;
        }
        slide.addShape(pres.ShapeType.rect, shapeOpts);
        break;
      }

      case "image": {
        const src = raw.imgSrc;
        const isRemoteUrl = src.startsWith("http://") || src.startsWith("https://");
        const isDataUri = src.startsWith("data:");

        if (isDataUri) {
          // Base64 data URI — pass directly
          slide.addImage({ data: src, x, y, w, h });
        } else if (isRemoteUrl) {
          // Remote URLs fail at writeFile() time (deferred fetch).
          // Add a placeholder shape instead.
          slide.addShape(pres.ShapeType.rect, {
            x,
            y,
            w,
            h,
            fill: { color: "E2E8F0" },
            line: { color: "94A3B8", width: 1 },
          });
        } else if (src) {
          // Local file path
          slide.addImage({ path: src, x, y, w, h });
        } else {
          // No source — placeholder
          slide.addShape(pres.ShapeType.rect, {
            x,
            y,
            w,
            h,
            fill: { color: "E2E8F0" },
            line: { color: "94A3B8", width: 1 },
          });
        }
        break;
      }

      case "bullets": {
        const textRows = raw.bulletItems.map((item) => ({
          text: item,
          options: {
            bullet: true,
            fontSize: fontSizePt,
            color: fontColor,
            bold: isBold,
            fontFace,
          },
        }));
        const textOpts: Record<string, unknown> = {
          x,
          y,
          w,
          h,
          valign: "top",
          align,
          lineSpacingMultiple: raw.style.lineHeight,
        };
        if (bgColor) {
          textOpts.fill = { color: bgColor };
        }
        slide.addText(textRows, textOpts);
        break;
      }

      case "title":
      case "text":
      default: {
        const textOpts: Record<string, unknown> = {
          x,
          y,
          w,
          h,
          fontSize: fontSizePt,
          color: fontColor,
          bold: isBold,
          fontFace,
          align,
          valign: "top",
          wrap: true,
          lineSpacingMultiple: raw.style.lineHeight,
        };
        if (bgColor) {
          textOpts.fill = { color: bgColor };
        }
        slide.addText(raw.textContent, textOpts);
        break;
      }
    }
  }

  return pres;
}

/**
 * Convert HTML to PPTX and save to a file.
 */
export async function htmlToPptxFile(
  page: Page,
  html: string,
  outputPath: string
): Promise<void> {
  const pres = (await htmlToPptx(page, html)) as { writeFile: (opts: { fileName: string }) => Promise<void> };
  await pres.writeFile({ fileName: outputPath });
}

/**
 * Convert HTML to PPTX and return as a Buffer.
 */
export async function htmlToPptxBuffer(
  page: Page,
  html: string
): Promise<Buffer> {
  const pres = (await htmlToPptx(page, html)) as { write: (opts: { outputType: string }) => Promise<unknown> };
  const result = await pres.write({ outputType: "nodebuffer" });
  return result as Buffer;
}

/**
 * Clean font-family string (remove quotes, take first family).
 */
function cleanFontFamily(fontFamily: string): string {
  if (!fontFamily) return "Arial";
  const first = fontFamily.split(",")[0]?.trim().replace(/['"]/g, "");
  return first || "Arial";
}

/**
 * Map CSS text-align to PptxGenJS align.
 */
function mapTextAlign(
  textAlign: string
): "left" | "center" | "right" | "justify" {
  switch (textAlign) {
    case "center":
      return "center";
    case "right":
      return "right";
    case "justify":
      return "justify";
    default:
      return "left";
  }
}
