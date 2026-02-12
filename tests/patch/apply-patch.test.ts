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
    expect(overrides[0]!.clamp_reason).toBe("budget");
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
    expect(overrides[0]!.clamp_reason).toBe("budget");
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
    expect(overrides[0]!.clamp_reason).toBe("budget");
  });

  // ── Image aspect ratio enforcement ──

  it("auto-adjusts h when only w is patched on an image", () => {
    const ir = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "img1",
          type: "image",
          priority: 40,
          content: "photo.png",
          layout: { x: 100, y: 100, w: 400, h: 300, zIndex: 10 },
          style: {},
        },
      ],
    });
    // Patch only w: 400→200, ratio 4:3 → h should become 150
    const patch = parsePatch({ edits: [{ eid: "img1", layout: { w: 200 } }] });
    const { ir: result, overrides } = applyPatch(ir, patch);
    const img = result.elements[0]!;
    expect(img.layout.w).toBe(200);
    expect(img.layout.h).toBe(150);
    expect(overrides.some((o) => o.eid === "img1" && o.field === "layout.h")).toBe(true);
  });

  it("auto-adjusts w when only h is patched on an image", () => {
    const ir = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "img1",
          type: "image",
          priority: 40,
          content: "photo.png",
          layout: { x: 100, y: 100, w: 400, h: 300, zIndex: 10 },
          style: {},
        },
      ],
    });
    // Patch only h: 300→150, ratio 4:3 → w should become 200
    const patch = parsePatch({ edits: [{ eid: "img1", layout: { h: 150 } }] });
    const { ir: result, overrides } = applyPatch(ir, patch);
    const img = result.elements[0]!;
    expect(img.layout.h).toBe(150);
    expect(img.layout.w).toBe(200);
    expect(overrides.some((o) => o.eid === "img1" && o.field === "layout.w")).toBe(true);
  });

  it("does not override when both w and h are patched within tolerance", () => {
    const ir = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "img1",
          type: "image",
          priority: 40,
          content: "photo.png",
          layout: { x: 100, y: 100, w: 400, h: 300, zIndex: 10 },
          style: {},
        },
      ],
    });
    // Both patched, same ratio (4:3) → no override
    const patch = parsePatch({ edits: [{ eid: "img1", layout: { w: 200, h: 150 } }] });
    const { ir: result, overrides } = applyPatch(ir, patch);
    const img = result.elements[0]!;
    expect(img.layout.w).toBe(200);
    expect(img.layout.h).toBe(150);
    expect(overrides.filter((o) => o.reason.includes("aspect ratio"))).toHaveLength(0);
  });

  it("clamps h when both w and h are patched with distorted ratio", () => {
    const ir = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "img1",
          type: "image",
          priority: 40,
          content: "photo.png",
          layout: { x: 100, y: 100, w: 400, h: 300, zIndex: 10 },
          style: {},
        },
      ],
    });
    // Both patched, distorted (200×200 = 1:1, original 4:3) → h clamped to 150
    const patch = parsePatch({ edits: [{ eid: "img1", layout: { w: 200, h: 200 } }] });
    const { ir: result, overrides } = applyPatch(ir, patch);
    const img = result.elements[0]!;
    expect(img.layout.w).toBe(200);
    expect(img.layout.h).toBe(150);
    const ratioOverride = overrides.find((o) => o.reason.includes("aspect ratio"));
    expect(ratioOverride).toBeDefined();
    expect(ratioOverride!.field).toBe("layout.h");
    expect(ratioOverride!.requested).toBe(200);
    expect(ratioOverride!.clamped_to).toBe(150);
    expect(ratioOverride!.clamp_reason).toBe("ratio");
  });

  it("does not enforce aspect ratio on non-image elements", () => {
    const ir = parseIR({
      slide: { w: 1280, h: 720 },
      elements: [
        {
          eid: "txt1",
          type: "text",
          priority: 40,
          content: "Hello",
          layout: { x: 100, y: 100, w: 400, h: 300, zIndex: 10 },
          style: { fontSize: 16 },
        },
      ],
    });
    // Patch only w on a text element → h should NOT change
    const patch = parsePatch({ edits: [{ eid: "txt1", layout: { w: 200 } }] });
    const { ir: result, overrides } = applyPatch(ir, patch);
    const txt = result.elements[0]!;
    expect(txt.layout.w).toBe(200);
    expect(txt.layout.h).toBe(300); // unchanged
    expect(overrides.filter((o) => o.reason.includes("aspect ratio"))).toHaveLength(0);
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

  it("logs min_font override when fontSize is below floor", () => {
    const ir = parseIR(sampleIR);
    // e_bullets_002 priority 80, fontSize 22. Set to 10 → budget clamps to 18.7, then min font to 20
    const patch = parsePatch({
      edits: [{ eid: "e_bullets_002", style: { fontSize: 10 } }],
    });
    const { overrides } = applyPatch(ir, patch);
    const minFontOverride = overrides.find((o) => o.clamp_reason === "min_font");
    expect(minFontOverride).toBeDefined();
    expect(minFontOverride!.eid).toBe("e_bullets_002");
    expect(minFontOverride!.field).toBe("style.fontSize");
    expect(minFontOverride!.clamped_to).toBe(20);
  });

  it("logs bounds override when element exceeds slide edges", () => {
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
    const { overrides } = applyPatch(ir, patch);
    const boundsOverride = overrides.find((o) => o.clamp_reason === "bounds");
    expect(boundsOverride).toBeDefined();
    expect(boundsOverride!.field).toBe("layout.w");
    expect(boundsOverride!.clamped_to).toBe(80);
  });

  it("logs bounds override for negative coordinates", () => {
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
      edits: [{ eid: "e1", layout: { x: -50, y: -30 } }],
    });
    const { overrides } = applyPatch(ir, patch);
    const xOverride = overrides.find((o) => o.field === "layout.x" && o.clamp_reason === "bounds");
    const yOverride = overrides.find((o) => o.field === "layout.y" && o.clamp_reason === "bounds");
    expect(xOverride).toBeDefined();
    expect(xOverride!.requested).toBe(-50);
    expect(xOverride!.clamped_to).toBe(0);
    expect(yOverride).toBeDefined();
    expect(yOverride!.requested).toBe(-30);
    expect(yOverride!.clamped_to).toBe(0);
  });
});
