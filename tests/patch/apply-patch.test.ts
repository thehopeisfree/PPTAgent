import { describe, it, expect } from "vitest";
import { applyPatch } from "../../src/patch/apply-patch.js";
import { parseIR } from "../../src/schema/ir.js";
import { parsePatch } from "../../src/schema/patch.js";
import sampleIR from "../fixtures/sample-ir.json";
import samplePatch from "../fixtures/sample-patch.json";

describe("applyPatch", () => {
  it("shallow-merges layout and style fields", () => {
    const ir = parseIR(sampleIR);
    const patch = parsePatch(samplePatch);
    const { ir: result } = applyPatch(ir, patch);

    const bullets = result.elements.find((e) => e.eid === "e_bullets_002")!;
    expect(bullets.layout.y).toBe(120);
    expect(bullets.layout.h).toBe(570);
    // x should be preserved
    expect(bullets.layout.x).toBe(64);
    // w should be preserved
    expect(bullets.layout.w).toBe(820);
  });

  it("enforces min font size", () => {
    const ir = parseIR(sampleIR);
    const patch = parsePatch({
      edits: [{ eid: "e_bullets_002", style: { fontSize: 10 } }],
    });
    const { ir: result } = applyPatch(ir, patch);
    const bullets = result.elements.find((e) => e.eid === "e_bullets_002")!;
    // Priority 80 → min font 20
    expect(bullets.style.fontSize).toBe(20);
  });

  it("enforces position budget for high-priority elements", () => {
    const ir = parseIR(sampleIR);
    // Title is priority 100, currently at y=32
    // Trying to move to y=200 (delta=168, exceeds 48px budget)
    const patch = parsePatch({
      edits: [{ eid: "e_title_001", layout: { y: 200 } }],
    });
    const { ir: result, overrides } = applyPatch(ir, patch);
    const title = result.elements.find((e) => e.eid === "e_title_001")!;
    // Should be clamped to 32 + 48 = 80
    expect(title.layout.y).toBe(80);
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.field).toBe("layout.y");
    expect(overrides[0]!.requested).toBe(200);
    expect(overrides[0]!.clamped_to).toBe(80);
  });

  it("enforces size budget for high-priority elements", () => {
    const ir = parseIR(sampleIR);
    // Title is priority 100, h=80
    // Trying to set h=200 (would be 150% increase, exceeds 15% budget)
    const patch = parsePatch({
      edits: [{ eid: "e_title_001", layout: { h: 200 } }],
    });
    const { ir: result, overrides } = applyPatch(ir, patch);
    const title = result.elements.find((e) => e.eid === "e_title_001")!;
    // 80 * 1.15 = 92
    expect(title.layout.h).toBe(92);
    expect(overrides.length).toBeGreaterThan(0);
  });

  it("allows unrestricted changes to low-priority elements", () => {
    const ir = parseIR(sampleIR);
    // bg_001 is priority 20 — no budget constraints
    const patch = parsePatch({
      edits: [{ eid: "e_bg_001", layout: { x: 500, w: 100 } }],
    });
    const { ir: result, overrides } = applyPatch(ir, patch);
    const bg = result.elements.find((e) => e.eid === "e_bg_001")!;
    expect(bg.layout.x).toBe(500);
    expect(bg.layout.w).toBe(100);
    expect(overrides).toHaveLength(0);
  });

  it("clamps layout to slide bounds", () => {
    const ir = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "e1",
          type: "text",
          priority: 40,
          content: "Test",
          layout: { x: 100, y: 100, w: 200, h: 100, zIndex: 10 },
          style: { fontSize: 16 },
        },
      ],
    });
    const patch = parsePatch({
      edits: [{ eid: "e1", layout: { x: 1200, w: 200 } }],
    });
    const { ir: result } = applyPatch(ir, patch);
    const el = result.elements[0]!;
    // x=1200, w=200 → x+w=1400 > 1280 → w clamped to 80
    expect(el.layout.x).toBe(1200);
    expect(el.layout.w).toBe(80);
  });

  it("does not modify original IR", () => {
    const ir = parseIR(sampleIR);
    const originalY = ir.elements[2]!.layout.y;
    const patch = parsePatch(samplePatch);
    applyPatch(ir, patch);
    expect(ir.elements[2]!.layout.y).toBe(originalY);
  });

  it("ignores edits for unknown eids", () => {
    const ir = parseIR(sampleIR);
    const patch = parsePatch({
      edits: [{ eid: "nonexistent", layout: { x: 999 } }],
    });
    const { ir: result } = applyPatch(ir, patch);
    // Should be unchanged
    expect(result.elements).toHaveLength(3);
  });

  it("applies fontSize budget on style properties", () => {
    const ir = parseIR(sampleIR);
    // Title priority 100, fontSize 44. Try setting to 20 (> 15% decrease)
    const patch = parsePatch({
      edits: [{ eid: "e_title_001", style: { fontSize: 20 } }],
    });
    const { ir: result, overrides } = applyPatch(ir, patch);
    const title = result.elements.find((e) => e.eid === "e_title_001")!;
    // 44 * 0.85 = 37.4
    expect(title.style.fontSize).toBeCloseTo(37.4, 1);
    expect(overrides.length).toBeGreaterThan(0);
  });

  it("still enforces min font after budget clamping", () => {
    const ir = parseIR(sampleIR);
    // Bullets priority 80, fontSize 22. Budget allows down to 22*0.85=18.7
    // But min font for priority 80 is 20
    const patch = parsePatch({
      edits: [{ eid: "e_bullets_002", style: { fontSize: 18 } }],
    });
    const { ir: result } = applyPatch(ir, patch);
    const bullets = result.elements.find((e) => e.eid === "e_bullets_002")!;
    // Budget clamped to 18.7, then min font enforces 20
    expect(bullets.style.fontSize).toBe(20);
  });
});
