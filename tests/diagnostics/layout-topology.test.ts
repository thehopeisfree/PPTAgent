import { describe, it, expect } from "vitest";
import { detectLayoutTopology } from "../../src/diagnostics/detectors/layout-topology.js";
import type { DOMElement } from "../../src/schema/dom.js";
import type { IRElement } from "../../src/schema/ir.js";
import { TOPOLOGY_SEVERITY } from "../../src/constants.js";

function makeDOMElement(overrides: Partial<DOMElement> & { eid: string }): DOMElement {
  return {
    bbox: { x: 0, y: 0, w: 400, h: 100 },
    safeBox: { x: -8, y: -8, w: 416, h: 116 },
    contentBox: { x: 0, y: 0, w: 300, h: 80 },
    zIndex: 10,
    computed: { fontSize: 24, lineHeight: 1.5 },
    ...overrides,
  };
}

function makeIRElement(overrides: Partial<IRElement> & { eid: string; type: IRElement["type"] }): IRElement {
  return {
    priority: 80,
    content: "test",
    layout: { x: 0, y: 0, w: 400, h: 100, zIndex: 10 },
    style: { fontSize: 24, lineHeight: 1.5 },
    ...overrides,
  };
}

describe("detectLayoutTopology", () => {
  it("detects title below bullets (center-y)", () => {
    // Title center-y = 450, Bullets center-y = 150
    const domElements: DOMElement[] = [
      makeDOMElement({ eid: "t1", bbox: { x: 0, y: 400, w: 400, h: 100 } }),
      makeDOMElement({ eid: "b1", bbox: { x: 0, y: 100, w: 400, h: 100 } }),
    ];
    const irElements: IRElement[] = [
      makeIRElement({ eid: "t1", type: "title", priority: 100 }),
      makeIRElement({ eid: "b1", type: "bullets", priority: 80 }),
    ];

    const defects = detectLayoutTopology(domElements, irElements);
    expect(defects).toHaveLength(1);
    expect(defects[0]!.type).toBe("layout_topology");
    expect(defects[0]!.severity).toBe(TOPOLOGY_SEVERITY);
    expect(defects[0]!.eid).toBe("t1");
    expect(defects[0]!.owner_eid).toBe("t1");
    expect(defects[0]!.other_eid).toBe("b1");
    expect(defects[0]!.hint).toBeDefined();
    expect(defects[0]!.hint!.action).toBe("move_to_top");
  });

  it("reports no defect when title is above bullets", () => {
    // Title center-y = 50, Bullets center-y = 250
    const domElements: DOMElement[] = [
      makeDOMElement({ eid: "t1", bbox: { x: 0, y: 0, w: 400, h: 100 } }),
      makeDOMElement({ eid: "b1", bbox: { x: 0, y: 200, w: 400, h: 100 } }),
    ];
    const irElements: IRElement[] = [
      makeIRElement({ eid: "t1", type: "title", priority: 100 }),
      makeIRElement({ eid: "b1", type: "bullets", priority: 80 }),
    ];

    const defects = detectLayoutTopology(domElements, irElements);
    expect(defects).toHaveLength(0);
  });

  it("detects title below text element", () => {
    // Title center-y = 400, Text center-y = 100
    const domElements: DOMElement[] = [
      makeDOMElement({ eid: "t1", bbox: { x: 0, y: 350, w: 400, h: 100 } }),
      makeDOMElement({ eid: "txt1", bbox: { x: 0, y: 50, w: 400, h: 100 } }),
    ];
    const irElements: IRElement[] = [
      makeIRElement({ eid: "t1", type: "title", priority: 100 }),
      makeIRElement({ eid: "txt1", type: "text", priority: 60 }),
    ];

    const defects = detectLayoutTopology(domElements, irElements);
    expect(defects).toHaveLength(1);
    expect(defects[0]!.type).toBe("layout_topology");
  });

  it("does not report image elements as body", () => {
    // Title center-y = 400, Image center-y = 100
    const domElements: DOMElement[] = [
      makeDOMElement({ eid: "t1", bbox: { x: 0, y: 350, w: 400, h: 100 } }),
      makeDOMElement({ eid: "img1", bbox: { x: 0, y: 50, w: 400, h: 100 } }),
    ];
    const irElements: IRElement[] = [
      makeIRElement({ eid: "t1", type: "title", priority: 100 }),
      makeIRElement({ eid: "img1", type: "image", priority: 40 }),
    ];

    const defects = detectLayoutTopology(domElements, irElements);
    expect(defects).toHaveLength(0);
  });

  it("does not report decoration elements as body", () => {
    // Title center-y = 400, Decoration center-y = 100
    const domElements: DOMElement[] = [
      makeDOMElement({ eid: "t1", bbox: { x: 0, y: 350, w: 400, h: 100 } }),
      makeDOMElement({ eid: "dec1", bbox: { x: 0, y: 50, w: 400, h: 100 } }),
    ];
    const irElements: IRElement[] = [
      makeIRElement({ eid: "t1", type: "title", priority: 100 }),
      makeIRElement({ eid: "dec1", type: "decoration", priority: 20 }),
    ];

    const defects = detectLayoutTopology(domElements, irElements);
    expect(defects).toHaveLength(0);
  });

  it("reports multiple violations for multiple body elements", () => {
    // Title center-y = 500, Two body elements above
    const domElements: DOMElement[] = [
      makeDOMElement({ eid: "t1", bbox: { x: 0, y: 450, w: 400, h: 100 } }),
      makeDOMElement({ eid: "b1", bbox: { x: 0, y: 100, w: 400, h: 100 } }),
      makeDOMElement({ eid: "txt1", bbox: { x: 0, y: 250, w: 400, h: 100 } }),
    ];
    const irElements: IRElement[] = [
      makeIRElement({ eid: "t1", type: "title", priority: 100 }),
      makeIRElement({ eid: "b1", type: "bullets", priority: 80 }),
      makeIRElement({ eid: "txt1", type: "text", priority: 60 }),
    ];

    const defects = detectLayoutTopology(domElements, irElements);
    expect(defects).toHaveLength(2);
    expect(defects.every((d) => d.type === "layout_topology")).toBe(true);
  });

  it("does not report when center-y values are equal (strict >)", () => {
    // Both center-y = 150 (y=100, h=100 → cy = 100 + 50 = 150)
    const domElements: DOMElement[] = [
      makeDOMElement({ eid: "t1", bbox: { x: 0, y: 100, w: 400, h: 100 } }),
      makeDOMElement({ eid: "b1", bbox: { x: 0, y: 100, w: 400, h: 100 } }),
    ];
    const irElements: IRElement[] = [
      makeIRElement({ eid: "t1", type: "title", priority: 100 }),
      makeIRElement({ eid: "b1", type: "bullets", priority: 80 }),
    ];

    const defects = detectLayoutTopology(domElements, irElements);
    expect(defects).toHaveLength(0);
  });
});
