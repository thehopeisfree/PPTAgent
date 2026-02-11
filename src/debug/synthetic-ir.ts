import type { IRDocument, IRElement, ElementType } from "../schema/ir.js";
import type { DOMDocument } from "../schema/dom.js";
import { SLIDE_W, SLIDE_H } from "../constants.js";

export interface InputElement {
  eid: string;
  type?: string;
  priority?: number;
  content?: string;
  style?: Record<string, unknown>;
}

/**
 * Construct a minimal IRDocument from DOM extraction data and optional
 * input.json element metadata. Uses DOM bbox as layout (accurate post-render
 * positions) and falls back to input metadata for type/priority/content which
 * the DOM doesn't carry.
 */
export function syntheticIRFromDOM(
  dom: DOMDocument,
  inputElements?: InputElement[],
): IRDocument {
  const inputMap = new Map<string, InputElement>();
  if (inputElements) {
    for (const el of inputElements) inputMap.set(el.eid, el);
  }

  const elements: IRElement[] = dom.elements.map((domEl) => {
    const input = inputMap.get(domEl.eid);
    return {
      eid: domEl.eid,
      type: (input?.type as ElementType) ?? "text",
      priority: input?.priority ?? 50,
      content: input?.content ?? "",
      layout: {
        x: domEl.bbox.x,
        y: domEl.bbox.y,
        w: domEl.bbox.w,
        h: domEl.bbox.h,
        zIndex: domEl.zIndex,
      },
      style: {
        fontSize: domEl.computed.fontSize,
        lineHeight: domEl.computed.lineHeight,
        ...(input?.style ?? {}),
      },
    };
  });

  return {
    slide: { w: dom.slide?.w ?? SLIDE_W, h: dom.slide?.h ?? SLIDE_H },
    elements,
  };
}
