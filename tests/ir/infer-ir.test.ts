import { describe, it, expect } from "vitest";
import {
  inferType,
  inferPriority,
  inferIRFromDOM,
} from "../../src/ir/infer-ir.js";
import type { TypeSignal } from "../../src/ir/infer-ir.js";
import type { DOMDocument, DOMElement } from "../../src/schema/dom.js";

// ── Helpers ─────────────────────────────────────────────────────────

function makeDOMEl(overrides?: Partial<DOMElement>): DOMElement {
  return {
    eid: "e1",
    bbox: { x: 0, y: 0, w: 200, h: 50 },
    safeBox: { x: -8, y: -8, w: 216, h: 66 },
    contentBox: { x: 0, y: 0, w: 200, h: 40 },
    zIndex: 10,
    computed: { fontSize: 18, lineHeight: 1.4 },
    ...overrides,
  };
}

function makeSignal(overrides?: Partial<TypeSignal>): TypeSignal {
  return {
    eid: "e1",
    hasImg: false,
    hasList: false,
    hasText: true,
    hasBg: false,
    fontWeight: 400,
    ...overrides,
  };
}

function makeDOMDoc(elements: DOMElement[]): DOMDocument {
  return {
    slide: { w: 1280, h: 720 },
    safe_padding: 8,
    elements,
  };
}

// ── inferType ───────────────────────────────────────────────────────

describe("inferType", () => {
  it("image: hasImg without text", () => {
    const signal = makeSignal({ hasImg: true, hasText: false });
    expect(inferType(signal, makeDOMEl())).toBe("image");
  });

  it("image with alt text still counts as image (hasImg, no hasText)", () => {
    // The browser script strips <img> before checking text
    const signal = makeSignal({ hasImg: true, hasText: false });
    expect(inferType(signal, makeDOMEl())).toBe("image");
  });

  it("img + text → NOT image (has caption text)", () => {
    const signal = makeSignal({ hasImg: true, hasText: true });
    // Falls through image rule → becomes text (or bullets etc.)
    expect(inferType(signal, makeDOMEl())).toBe("text");
  });

  it("bullets: has <ul>/<ol>", () => {
    const signal = makeSignal({ hasList: true, hasText: true });
    expect(inferType(signal, makeDOMEl())).toBe("bullets");
  });

  it("bullets even without text (empty list)", () => {
    const signal = makeSignal({ hasList: true, hasText: false });
    expect(inferType(signal, makeDOMEl())).toBe("bullets");
  });

  it("decoration: no text, has background", () => {
    const signal = makeSignal({ hasText: false, hasBg: true });
    expect(inferType(signal, makeDOMEl())).toBe("decoration");
  });

  it("title: bold + large font", () => {
    const signal = makeSignal({ fontWeight: 700, hasText: true });
    const domEl = makeDOMEl({ computed: { fontSize: 36, lineHeight: 1.2 } });
    expect(inferType(signal, domEl)).toBe("title");
  });

  it("not title if font too small (bold but 20px)", () => {
    const signal = makeSignal({ fontWeight: 700, hasText: true });
    const domEl = makeDOMEl({ computed: { fontSize: 20, lineHeight: 1.2 } });
    expect(inferType(signal, domEl)).toBe("text");
  });

  it("not title if not bold (large but normal weight)", () => {
    const signal = makeSignal({ fontWeight: 400, hasText: true });
    const domEl = makeDOMEl({ computed: { fontSize: 36, lineHeight: 1.2 } });
    expect(inferType(signal, domEl)).toBe("text");
  });

  it("fallback: plain text", () => {
    const signal = makeSignal({ hasText: true });
    expect(inferType(signal, makeDOMEl())).toBe("text");
  });

  it("priority order: image checked before bullets", () => {
    // Edge case: img inside a list — should be image
    const signal = makeSignal({ hasImg: true, hasList: true, hasText: false });
    expect(inferType(signal, makeDOMEl())).toBe("image");
  });

  it("priority order: bullets checked before decoration", () => {
    // List with background
    const signal = makeSignal({ hasList: true, hasText: true, hasBg: true });
    expect(inferType(signal, makeDOMEl())).toBe("bullets");
  });
});

// ── inferPriority ───────────────────────────────────────────────────

describe("inferPriority", () => {
  it("title → 100", () => expect(inferPriority("title")).toBe(100));
  it("text → 60", () => expect(inferPriority("text")).toBe(60));
  it("bullets → 60", () => expect(inferPriority("bullets")).toBe(60));
  it("image → 50", () => expect(inferPriority("image")).toBe(50));
  it("decoration → 0", () => expect(inferPriority("decoration")).toBe(0));
});

// ── inferIRFromDOM ──────────────────────────────────────────────────

describe("inferIRFromDOM", () => {
  it("builds IR with correct types from signals", () => {
    const dom = makeDOMDoc([
      makeDOMEl({
        eid: "e_title",
        bbox: { x: 40, y: 40, w: 800, h: 60 },
        computed: { fontSize: 36, lineHeight: 1.2 },
      }),
      makeDOMEl({
        eid: "e_body",
        bbox: { x: 40, y: 120, w: 600, h: 200 },
        computed: { fontSize: 18, lineHeight: 1.5 },
      }),
      makeDOMEl({
        eid: "e_bg",
        bbox: { x: 0, y: 0, w: 360, h: 720 },
        zIndex: 0,
        computed: { fontSize: 16, lineHeight: 1.2 },
      }),
    ]);

    const signals: TypeSignal[] = [
      makeSignal({ eid: "e_title", fontWeight: 700, hasText: true }),
      makeSignal({ eid: "e_body", hasList: true, hasText: true }),
      makeSignal({ eid: "e_bg", hasText: false, hasBg: true }),
    ];

    const ir = inferIRFromDOM(dom, signals);

    expect(ir.slide).toEqual({ w: 1280, h: 720 });
    expect(ir.elements).toHaveLength(3);

    const title = ir.elements.find((e) => e.eid === "e_title")!;
    expect(title.type).toBe("title");
    expect(title.priority).toBe(100);
    expect(title.layout).toEqual({ x: 40, y: 40, w: 800, h: 60, zIndex: 10 });

    const body = ir.elements.find((e) => e.eid === "e_body")!;
    expect(body.type).toBe("bullets");
    expect(body.priority).toBe(60);

    const bg = ir.elements.find((e) => e.eid === "e_bg")!;
    expect(bg.type).toBe("decoration");
    expect(bg.priority).toBe(0);
  });

  it("uses DEFAULT_Z_INDEX when zIndex is 0", () => {
    const dom = makeDOMDoc([
      makeDOMEl({ eid: "e1", zIndex: 0 }),
    ]);
    const signals: TypeSignal[] = [makeSignal({ eid: "e1" })];

    const ir = inferIRFromDOM(dom, signals);
    expect(ir.elements[0].layout.zIndex).toBe(10); // DEFAULT_Z_INDEX
  });

  it("preserves non-zero zIndex", () => {
    const dom = makeDOMDoc([
      makeDOMEl({ eid: "e1", zIndex: 5 }),
    ]);
    const signals: TypeSignal[] = [makeSignal({ eid: "e1" })];

    const ir = inferIRFromDOM(dom, signals);
    expect(ir.elements[0].layout.zIndex).toBe(5);
  });

  it("falls back to text when no signal found for element", () => {
    const dom = makeDOMDoc([makeDOMEl({ eid: "orphan" })]);
    // No matching signal
    const signals: TypeSignal[] = [];

    const ir = inferIRFromDOM(dom, signals);
    expect(ir.elements[0].type).toBe("text");
    expect(ir.elements[0].priority).toBe(60);
  });

  it("handles empty elements", () => {
    const dom = makeDOMDoc([]);
    const ir = inferIRFromDOM(dom, []);
    expect(ir.elements).toHaveLength(0);
  });

  it("copies fontSize and lineHeight into style", () => {
    const dom = makeDOMDoc([
      makeDOMEl({ computed: { fontSize: 24, lineHeight: 1.6 } }),
    ]);
    const signals: TypeSignal[] = [makeSignal()];

    const ir = inferIRFromDOM(dom, signals);
    expect(ir.elements[0].style.fontSize).toBe(24);
    expect(ir.elements[0].style.lineHeight).toBe(1.6);
  });
});
