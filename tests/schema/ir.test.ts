import { describe, it, expect } from "vitest";
import { parseIR } from "../../src/schema/ir.js";
import sampleIR from "../fixtures/sample-ir.json";

describe("IR Schema", () => {
  it("parses a valid IR document", () => {
    const ir = parseIR(sampleIR);
    expect(ir.slide.w).toBe(1280);
    expect(ir.slide.h).toBe(720);
    expect(ir.elements).toHaveLength(3);
  });

  it("applies default zIndex when not specified", () => {
    const ir = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "title",
          priority: 100,
          content: "Hello",
          layout: { x: 0, y: 0, w: 100, h: 50 },
        },
      ],
    });
    expect(ir.elements[0]!.layout.zIndex).toBe(10);
  });

  it("rejects duplicate eids", () => {
    expect(() =>
      parseIR({
        slide: { w: 1280, h: 720 },
        elements: [
          {
            eid: "e1",
            type: "title",
            priority: 100,
            content: "A",
            layout: { x: 0, y: 0, w: 100, h: 50 },
          },
          {
            eid: "e1",
            type: "text",
            priority: 60,
            content: "B",
            layout: { x: 0, y: 100, w: 100, h: 50 },
          },
        ],
      })
    ).toThrow("Duplicate eid");
  });

  it("rejects empty elements array", () => {
    expect(() =>
      parseIR({ slide: { w: 1280, h: 720 }, elements: [] })
    ).toThrow();
  });

  it("rejects invalid element type", () => {
    expect(() =>
      parseIR({
        slide: { w: 1280, h: 720 },
        elements: [
          {
            eid: "e1",
            type: "invalid_type",
            priority: 100,
            content: "A",
            layout: { x: 0, y: 0, w: 100, h: 50 },
          },
        ],
      })
    ).toThrow();
  });

  it("rejects priority outside 0-100", () => {
    expect(() =>
      parseIR({
        slide: { w: 1280, h: 720 },
        elements: [
          {
            eid: "e1",
            type: "title",
            priority: 150,
            content: "A",
            layout: { x: 0, y: 0, w: 100, h: 50 },
          },
        ],
      })
    ).toThrow();
  });

  it("rejects negative width/height", () => {
    expect(() =>
      parseIR({
        slide: { w: 1280, h: 720 },
        elements: [
          {
            eid: "e1",
            type: "title",
            priority: 100,
            content: "A",
            layout: { x: 0, y: 0, w: -10, h: 50 },
          },
        ],
      })
    ).toThrow();
  });

  it("preserves extra style properties via passthrough", () => {
    const ir = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "title",
          priority: 100,
          content: "A",
          layout: { x: 0, y: 0, w: 100, h: 50 },
          style: { fontSize: 32, customProp: "value" },
        },
      ],
    });
    expect((ir.elements[0]!.style as Record<string, unknown>)["customProp"]).toBe("value");
  });
});
