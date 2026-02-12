import { describe, it, expect } from "vitest";
import { diagnose } from "../../src/diagnostics/engine.js";
import type { DOMDocument } from "../../src/schema/dom.js";
import type { IRDocument } from "../../src/schema/ir.js";

describe("Diagnostics Engine", () => {
  it("returns empty defects for a clean layout", () => {
    const ir: IRDocument = {
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "title",
          priority: 100,
          content: "Hello",
          layout: { x: 48, y: 32, w: 400, h: 80, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
      ],
    };
    const dom: DOMDocument = {
      slide: { w: 1280, h: 720 },
      safe_padding: 8,
      elements: [
        {
          eid: "e1",
          bbox: { x: 48, y: 32, w: 400, h: 80 },
          safeBox: { x: 40, y: 24, w: 416, h: 96 },
          contentBox: { x: 48, y: 34, w: 300, h: 50 },
          zIndex: 10,
          computed: { fontSize: 44, lineHeight: 1.2 },
        },
      ],
    };

    const diag = diagnose(dom, ir);
    expect(diag.defects).toHaveLength(0);
    expect(diag.summary.defect_count).toBe(0);
    expect(diag.summary.total_severity).toBe(0);
  });

  it("detects multiple defect types", () => {
    const ir: IRDocument = {
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e_title",
          type: "title",
          priority: 100,
          content: "Title",
          layout: { x: 48, y: 32, w: 1184, h: 80, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e_text",
          type: "text",
          priority: 60,
          content: "Long text",
          layout: { x: 48, y: 50, w: 400, h: 100, zIndex: 10 },
          style: { fontSize: 14, lineHeight: 1.5 },
        },
      ],
    };
    const dom: DOMDocument = {
      slide: { w: 1280, h: 720 },
      safe_padding: 8,
      elements: [
        {
          eid: "e_title",
          bbox: { x: 48, y: 32, w: 1184, h: 80 },
          safeBox: { x: 40, y: 24, w: 1200, h: 96 },
          contentBox: { x: 48, y: 34, w: 400, h: 50 },
          zIndex: 10,
          computed: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e_text",
          bbox: { x: 48, y: 50, w: 400, h: 100 },
          safeBox: { x: 40, y: 42, w: 416, h: 116 },
          contentBox: { x: 48, y: 52, w: 380, h: 180 },
          zIndex: 10,
          computed: { fontSize: 14, lineHeight: 1.5 },
        },
      ],
    };

    const diag = diagnose(dom, ir);
    // Should detect: font_too_small (e_text 14 < 16), content_overflow (e_text 180 > 100), overlap
    expect(diag.defects.length).toBeGreaterThanOrEqual(2);
    const types = diag.defects.map((d) => d.type);
    expect(types).toContain("font_too_small");
    expect(types).toContain("content_overflow");
    expect(diag.summary.defect_count).toBe(diag.defects.length);
    expect(diag.summary.total_severity).toBeGreaterThan(0);
  });

  it("reports warnings separately from defects", () => {
    const ir: IRDocument = {
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "title",
          priority: 100,
          content: "A",
          layout: { x: 0, y: 0, w: 200, h: 200, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e2",
          type: "text",
          priority: 60,
          content: "B",
          layout: { x: 100, y: 100, w: 200, h: 200, zIndex: 20 },
          style: { fontSize: 16, lineHeight: 1.5 },
        },
      ],
    };
    const dom: DOMDocument = {
      slide: { w: 1280, h: 720 },
      safe_padding: 8,
      elements: [
        {
          eid: "e1",
          bbox: { x: 0, y: 0, w: 200, h: 200 },
          safeBox: { x: -8, y: -8, w: 216, h: 216 },
          contentBox: { x: 0, y: 0, w: 100, h: 50 },
          zIndex: 10,
          computed: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e2",
          bbox: { x: 100, y: 100, w: 200, h: 200 },
          safeBox: { x: 92, y: 92, w: 216, h: 216 },
          contentBox: { x: 100, y: 100, w: 100, h: 30 },
          zIndex: 20,
          computed: { fontSize: 16, lineHeight: 1.5 },
        },
      ],
    };

    const diag = diagnose(dom, ir);
    // Different zIndex → occlusion_suspected warning, not defect
    expect(diag.warnings.length).toBeGreaterThanOrEqual(1);
    expect(diag.summary.warning_count).toBe(diag.warnings.length);
    // Warnings should not contribute to total_severity
    const overlapDefects = diag.defects.filter((d) => d.type === "overlap");
    expect(overlapDefects).toHaveLength(0);
  });

  it("detects layout_topology when title is below body", () => {
    const ir: IRDocument = {
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e_title",
          type: "title",
          priority: 100,
          content: "Title",
          layout: { x: 48, y: 400, w: 400, h: 80, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e_bullets",
          type: "bullets",
          priority: 80,
          content: "• A\n• B",
          layout: { x: 48, y: 100, w: 400, h: 200, zIndex: 10 },
          style: { fontSize: 22, lineHeight: 1.5 },
        },
      ],
    };
    const dom: DOMDocument = {
      slide: { w: 1280, h: 720 },
      safe_padding: 8,
      elements: [
        {
          eid: "e_title",
          bbox: { x: 48, y: 400, w: 400, h: 80 },
          safeBox: { x: 40, y: 392, w: 416, h: 96 },
          contentBox: { x: 48, y: 402, w: 300, h: 50 },
          zIndex: 10,
          computed: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e_bullets",
          bbox: { x: 48, y: 100, w: 400, h: 200 },
          safeBox: { x: 40, y: 92, w: 416, h: 216 },
          contentBox: { x: 48, y: 102, w: 350, h: 180 },
          zIndex: 10,
          computed: { fontSize: 22, lineHeight: 1.5 },
        },
      ],
    };

    const diag = diagnose(dom, ir);
    const topoDefects = diag.defects.filter((d) => d.type === "layout_topology");
    expect(topoDefects).toHaveLength(1);
    expect(topoDefects[0]!.severity).toBe(5000);
  });

  it("places layout_topology defects before font_too_small in defect order", () => {
    const ir: IRDocument = {
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e_title",
          type: "title",
          priority: 100,
          content: "Title",
          layout: { x: 48, y: 500, w: 400, h: 80, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e_text",
          type: "text",
          priority: 60,
          content: "Body",
          layout: { x: 48, y: 100, w: 400, h: 200, zIndex: 10 },
          style: { fontSize: 14, lineHeight: 1.5 },
        },
      ],
    };
    const dom: DOMDocument = {
      slide: { w: 1280, h: 720 },
      safe_padding: 8,
      elements: [
        {
          eid: "e_title",
          bbox: { x: 48, y: 500, w: 400, h: 80 },
          safeBox: { x: 40, y: 492, w: 416, h: 96 },
          contentBox: { x: 48, y: 502, w: 300, h: 50 },
          zIndex: 10,
          computed: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e_text",
          bbox: { x: 48, y: 100, w: 400, h: 200 },
          safeBox: { x: 40, y: 92, w: 416, h: 216 },
          contentBox: { x: 48, y: 102, w: 350, h: 60 },
          zIndex: 10,
          computed: { fontSize: 14, lineHeight: 1.5 },
        },
      ],
    };

    const diag = diagnose(dom, ir);
    const types = diag.defects.map((d) => d.type);
    const topoIdx = types.indexOf("layout_topology");
    const fontIdx = types.indexOf("font_too_small");
    expect(topoIdx).toBeGreaterThanOrEqual(0);
    expect(fontIdx).toBeGreaterThanOrEqual(0);
    expect(topoIdx).toBeLessThan(fontIdx);
  });

  it("annotates hint with limited_by_budget for high-priority element needing >48px move", () => {
    // e1 (priority 100) overflows and hint suggests moving 100px
    const ir: IRDocument = {
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e_title",
          type: "title",
          priority: 100,
          content: "Title",
          layout: { x: 48, y: 32, w: 400, h: 80, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e_text",
          type: "text",
          priority: 80,
          content: "Body",
          layout: { x: 48, y: 80, w: 400, h: 200, zIndex: 10 },
          style: { fontSize: 22, lineHeight: 1.5 },
        },
      ],
    };
    const dom: DOMDocument = {
      slide: { w: 1280, h: 720 },
      safe_padding: 8,
      elements: [
        {
          eid: "e_title",
          bbox: { x: 48, y: 32, w: 400, h: 80 },
          safeBox: { x: 40, y: 24, w: 416, h: 96 },
          contentBox: { x: 48, y: 34, w: 300, h: 50 },
          zIndex: 10,
          computed: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e_text",
          bbox: { x: 48, y: 80, w: 400, h: 200 },
          safeBox: { x: 40, y: 72, w: 416, h: 216 },
          contentBox: { x: 48, y: 82, w: 350, h: 180 },
          zIndex: 10,
          computed: { fontSize: 22, lineHeight: 1.5 },
        },
      ],
    };

    const diag = diagnose(dom, ir);
    // Find overlap defects with hints that target high-priority elements
    const hintsWithBudget = diag.defects
      .filter((d) => d.hint?.limited_by_budget === true);
    // If any hint needs >48px move for a priority>=80 element, it should be flagged
    for (const d of hintsWithBudget) {
      expect(d.hint!.steps_needed).toBeGreaterThanOrEqual(1);
      expect(d.hint!.budget_max_delta).toBeDefined();
    }
  });

  it("does not annotate hints within budget", () => {
    const ir: IRDocument = {
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "title",
          priority: 100,
          content: "Hello",
          layout: { x: 48, y: 32, w: 400, h: 80, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
      ],
    };
    const dom: DOMDocument = {
      slide: { w: 1280, h: 720 },
      safe_padding: 8,
      elements: [
        {
          eid: "e1",
          bbox: { x: 48, y: 32, w: 400, h: 80 },
          safeBox: { x: 40, y: 24, w: 416, h: 96 },
          contentBox: { x: 48, y: 34, w: 300, h: 50 },
          zIndex: 10,
          computed: { fontSize: 44, lineHeight: 1.2 },
        },
      ],
    };

    const diag = diagnose(dom, ir);
    // No defects → no hints → nothing annotated
    for (const d of diag.defects) {
      if (d.hint) {
        expect(d.hint.limited_by_budget).toBeUndefined();
      }
    }
  });

  it("does not annotate limited_by_budget for low-priority elements", () => {
    const ir: IRDocument = {
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "text",
          priority: 40,
          content: "Body text that overflows",
          layout: { x: 48, y: 32, w: 400, h: 50, zIndex: 10 },
          style: { fontSize: 20, lineHeight: 1.5 },
        },
      ],
    };
    const dom: DOMDocument = {
      slide: { w: 1280, h: 720 },
      safe_padding: 8,
      elements: [
        {
          eid: "e1",
          bbox: { x: 48, y: 32, w: 400, h: 50 },
          safeBox: { x: 40, y: 24, w: 416, h: 66 },
          contentBox: { x: 48, y: 34, w: 380, h: 200 },
          zIndex: 10,
          computed: { fontSize: 20, lineHeight: 1.5 },
        },
      ],
    };

    const diag = diagnose(dom, ir);
    // Low-priority element should never get budget annotations
    for (const d of diag.defects) {
      if (d.hint) {
        expect(d.hint.limited_by_budget).toBeUndefined();
      }
    }
  });

  it("builds conflict graph for overlapping elements", () => {
    const ir: IRDocument = {
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "title",
          priority: 100,
          content: "Title",
          layout: { x: 100, y: 100, w: 400, h: 100, zIndex: 10 },
          style: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e2",
          type: "bullets",
          priority: 80,
          content: "• A",
          layout: { x: 100, y: 150, w: 400, h: 200, zIndex: 10 },
          style: { fontSize: 22, lineHeight: 1.5 },
        },
      ],
    };
    const dom: DOMDocument = {
      slide: { w: 1280, h: 720 },
      safe_padding: 8,
      elements: [
        {
          eid: "e1",
          bbox: { x: 100, y: 100, w: 400, h: 100 },
          safeBox: { x: 92, y: 92, w: 416, h: 116 },
          contentBox: { x: 100, y: 102, w: 300, h: 50 },
          zIndex: 10,
          computed: { fontSize: 44, lineHeight: 1.2 },
        },
        {
          eid: "e2",
          bbox: { x: 100, y: 150, w: 400, h: 200 },
          safeBox: { x: 92, y: 142, w: 416, h: 216 },
          contentBox: { x: 100, y: 152, w: 350, h: 60 },
          zIndex: 10,
          computed: { fontSize: 22, lineHeight: 1.5 },
        },
      ],
    };

    const diag = diagnose(dom, ir);
    expect(diag.summary.conflict_graph).toBeDefined();
    expect(diag.summary.conflict_graph!.length).toBeGreaterThanOrEqual(1);
    const comp = diag.summary.conflict_graph![0]!;
    expect(comp.eids).toHaveLength(2);
    expect(comp.anchor_eid).toBe("e1"); // e1 has priority 100
    expect(comp.edges).toHaveLength(1);
    expect(comp.edges[0]!.separations).toHaveLength(4);
    expect(comp.envelopes).toHaveLength(2);
  });
});
