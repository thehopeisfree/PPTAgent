import { describe, it, expect } from "vitest";
import { syntheticIRFromDOM } from "../../src/debug/synthetic-ir.js";
import type { InputElement } from "../../src/debug/synthetic-ir.js";
import type { DOMDocument } from "../../src/schema/dom.js";
import { SLIDE_W, SLIDE_H } from "../../src/constants.js";

function makeDOMDoc(overrides?: Partial<DOMDocument>): DOMDocument {
  return {
    slide: { w: 1280, h: 720 },
    safe_padding: 8,
    elements: [
      {
        eid: "e1",
        bbox: { x: 10, y: 20, w: 300, h: 100 },
        safeBox: { x: 2, y: 12, w: 316, h: 116 },
        contentBox: { x: 10, y: 20, w: 300, h: 80 },
        zIndex: 10,
        computed: { fontSize: 24, lineHeight: 1.4 },
      },
      {
        eid: "e2",
        bbox: { x: 400, y: 200, w: 200, h: 150 },
        safeBox: { x: 392, y: 192, w: 216, h: 166 },
        contentBox: null,
        zIndex: 5,
        computed: { fontSize: 16, lineHeight: 1.2 },
      },
    ],
    ...overrides,
  };
}

describe("syntheticIRFromDOM", () => {
  it("builds IR from DOM-only (no input metadata)", () => {
    const dom = makeDOMDoc();
    const ir = syntheticIRFromDOM(dom);

    expect(ir.slide).toEqual({ w: 1280, h: 720 });
    expect(ir.elements).toHaveLength(2);

    const el1 = ir.elements.find((e) => e.eid === "e1")!;
    expect(el1.type).toBe("text"); // default
    expect(el1.priority).toBe(50); // default
    expect(el1.content).toBe(""); // default
    expect(el1.layout).toEqual({ x: 10, y: 20, w: 300, h: 100, zIndex: 10 });
    expect(el1.style.fontSize).toBe(24);
    expect(el1.style.lineHeight).toBe(1.4);

    const el2 = ir.elements.find((e) => e.eid === "e2")!;
    expect(el2.layout.zIndex).toBe(5);
    expect(el2.style.fontSize).toBe(16);
  });

  it("merges input metadata for type, priority, content", () => {
    const dom = makeDOMDoc();
    const inputElements: InputElement[] = [
      {
        eid: "e1",
        type: "title",
        priority: 100,
        content: "Hello World",
      },
      {
        eid: "e2",
        type: "image",
        priority: 40,
        content: "https://example.com/img.png",
      },
    ];

    const ir = syntheticIRFromDOM(dom, inputElements);

    const el1 = ir.elements.find((e) => e.eid === "e1")!;
    expect(el1.type).toBe("title");
    expect(el1.priority).toBe(100);
    expect(el1.content).toBe("Hello World");

    const el2 = ir.elements.find((e) => e.eid === "e2")!;
    expect(el2.type).toBe("image");
    expect(el2.priority).toBe(40);
    expect(el2.content).toBe("https://example.com/img.png");
  });

  it("merges input style properties alongside DOM computed styles", () => {
    const dom = makeDOMDoc();
    const inputElements: InputElement[] = [
      {
        eid: "e1",
        style: { color: "#ff0000", fontWeight: "bold" },
      },
    ];

    const ir = syntheticIRFromDOM(dom, inputElements);
    const el1 = ir.elements.find((e) => e.eid === "e1")!;

    // DOM computed values preserved
    expect(el1.style.fontSize).toBe(24);
    expect(el1.style.lineHeight).toBe(1.4);
    // Input style merged in
    expect(el1.style.color).toBe("#ff0000");
    expect(el1.style.fontWeight).toBe("bold");
  });

  it("uses SLIDE_W/SLIDE_H defaults when DOM slide dimensions missing", () => {
    const dom = makeDOMDoc();
    // Simulate missing slide dimensions by setting to undefined
    (dom as any).slide = undefined;

    const ir = syntheticIRFromDOM(dom);
    expect(ir.slide).toEqual({ w: SLIDE_W, h: SLIDE_H });
  });

  it("handles partial input metadata (some elements not in input)", () => {
    const dom = makeDOMDoc();
    const inputElements: InputElement[] = [
      { eid: "e1", type: "bullets", priority: 80 },
      // e2 not in input — should get defaults
    ];

    const ir = syntheticIRFromDOM(dom, inputElements);

    const el1 = ir.elements.find((e) => e.eid === "e1")!;
    expect(el1.type).toBe("bullets");
    expect(el1.priority).toBe(80);

    const el2 = ir.elements.find((e) => e.eid === "e2")!;
    expect(el2.type).toBe("text");
    expect(el2.priority).toBe(50);
  });

  it("handles empty DOM elements array", () => {
    const dom = makeDOMDoc({ elements: [] });
    const ir = syntheticIRFromDOM(dom);
    expect(ir.elements).toHaveLength(0);
    expect(ir.slide).toEqual({ w: 1280, h: 720 });
  });
});
