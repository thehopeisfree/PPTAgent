# PPTAgent — Slide Layout Skill

**Triggers**: Any task involving creating or fixing the layout of a single 1280×720 HTML slide — positioning elements, resolving overlaps, fixing overflow, ensuring readability.

## Quick Reference

| Task | What to do |
|---|---|
| Create a slide | Generate HTML with flexbox/natural layout inside `#slide` |
| Flatten to absolute | Run `npx tsx scripts/flatten.ts input.html abs.html` |
| Check your layout | Run `npx tsx scripts/check-slide.ts abs.html input.json` |
| Fix defects | Read diagnostics hints, edit your HTML (now absolute), re-check |
| Generate PPTX | Run `npx tsx scripts/to-pptx.ts final.html output.pptx` |

## Workflow (Hybrid Approach)

```
1. Read the IR input (content + priorities)
2. Generate HTML slide — use flexbox/natural CSS layout for initial version
3. Flatten: system converts flexbox → absolute positioning via Playwright
4. Validate: run check-slide.ts → get defect list with hints
5. Fix: edit the absolute-positioned HTML using hint values
6. Re-validate (go to 4 until clean)
7. Convert to PPTX: run to-pptx.ts
```

**Why hybrid?** You generate the first version with flexbox (easier to get a reasonable layout). The system flattens it to absolute positioning (mechanical step). Then you fix defects by editing absolute coordinates (each hint is one CSS value to set).

---

## Slide HTML Format

Your HTML must follow this exact structure. The diagnostics pipeline depends on `#slide` and `data-eid`.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; }
    body { background: #fff; }
    #slide {
      position: relative;
      width: 1280px;
      height: 720px;
      overflow: hidden;
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
    }
  </style>
</head>
<body>
  <div id="slide">
    <!-- Every element MUST have data-eid and position: absolute -->
    <div data-eid="e_title" style="position: absolute; box-sizing: border-box;
         left: 40px; top: 40px; width: 800px; height: 72px; z-index: 10;
         overflow: visible; font-size: 42px; line-height: 1.2;
         font-weight: bold; color: #1e293b;">
      Team Performance Q3 2025
    </div>

    <div data-eid="e_bullets" style="position: absolute; box-sizing: border-box;
         left: 40px; top: 140px; width: 560px; height: 300px; z-index: 10;
         overflow: visible; font-size: 18px; line-height: 1.5; color: #334155;">
      <ul style="margin: 0; padding-left: 1.5em; list-style-type: disc">
        <li>Sprint velocity increased 34%</li>
        <li>Deployment frequency doubled</li>
      </ul>
    </div>

    <div data-eid="e_photo" style="position: absolute; box-sizing: border-box;
         left: 660px; top: 160px; width: 280px; height: 200px; z-index: 10;
         overflow: visible;">
      <img src="photo.jpg" style="width: 100%; height: 100%; object-fit: contain" alt="" />
    </div>

    <!-- decoration elements: exempt from overlap checks -->
    <div data-eid="e_accent" style="position: absolute; box-sizing: border-box;
         left: 0px; top: 0px; width: 12px; height: 720px; z-index: 0;
         overflow: visible; background-color: #2563eb;">
    </div>
  </div>
</body>
</html>
```

### Required Rules

| Rule | Detail |
|---|---|
| Container | `<div id="slide">` — exactly 1280×720px, `position: relative` |
| Elements | Every visible element must have a unique `data-eid` attribute |
| Positioning | All elements use `position: absolute; box-sizing: border-box` |
| Coordinates | `left`, `top`, `width`, `height` in px — relative to `#slide` top-left |
| Overflow | Set `overflow: visible` (diagnostics detects overflow via Range API) |
| Stacking | Use `z-index` for layering (default: 10). Decorations typically use 0. |
| Bullets | Wrap in `<ul>` with `<li>` items. Use `list-style-type: disc`, not unicode bullets |
| Images | Wrap in a div: `<div data-eid="..."><img src="..." style="width: 100%; height: 100%; object-fit: contain" /></div>` |

### Element Types and Rendering

| Type | HTML pattern | Notes |
|---|---|---|
| `title` | `<div data-eid="...">Title Text</div>` | Plain text, font-weight bold |
| `text` | `<div data-eid="...">Body text</div>` | Plain text |
| `bullets` | `<div data-eid="..."><ul><li>...</li></ul></div>` | `padding-left: 1.5em` on `<ul>` |
| `image` | `<div data-eid="..."><img src="..." .../></div>` | img fills container via width/height 100% |
| `decoration` | `<div data-eid="..."></div>` | Background shapes, accent bars |

---

## Validating Your Layout

After generating HTML, validate it with PPTAgent's diagnostics:

```typescript
import { chromium } from "playwright";
import { parseIR, extractDOM, diagnose } from "./src/index.js";
import * as fs from "node:fs";

// Launch browser (reuse across iterations)
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

// Read your HTML and the reference IR
const html = fs.readFileSync("slide.html", "utf-8");
const ir = parseIR(JSON.parse(fs.readFileSync("input.json", "utf-8")));

// Extract DOM measurements from rendered HTML
const dom = await extractDOM(page, html);

// Run diagnostics: compares DOM (what rendered) against IR (what was intended)
const diag = diagnose(dom, ir);

console.log(`Defects: ${diag.summary.defect_count}`);
console.log(`Severity: ${diag.summary.total_severity}`);
console.log(`Warnings: ${diag.summary.warning_count}`);

if (diag.defects.length > 0) {
  for (const d of diag.defects) {
    console.log(`[${d.type}] ${d.eid ?? d.owner_eid} — severity ${d.severity}`);
    if (d.hint) console.log(`  hint: ${d.hint.action}`, d.hint);
  }
}

await browser.close();
```

### What `diagnose()` Needs

- **`dom`** (from `extractDOM`): The actual rendered measurements — bounding boxes, content boxes (via Range API), computed font sizes, z-indices.
- **`ir`** (from `parseIR`): The input specification — element types, priorities, intended layout. Used to determine which element should move in overlaps (lower priority moves), minimum font sizes (by priority tier), and topology rules (title above body).

---

## Understanding Diagnostics Output

```typescript
{
  defects: [{
    type: "overlap",            // See defect types below
    owner_eid: "e_bullets",     // Lower-priority element (you should fix this one)
    other_eid: "e_title",       // Higher-priority element (leave it alone)
    severity: 2400,
    details: { overlap_area_px: 1200 },
    hint: {
      action: "move_down",
      validated: true,          // true = this fix won't create new defects
      suggested_y: 108,         // Absolute target value, NOT a delta
    },
  }],
  warnings: [{
    type: "occlusion_suspected",  // Cross-zIndex overlap (informational only)
    owner_eid: "e_callout",
    other_eid: "e_photo",
    details: { overlap_area_px: 5000, top_eid: "e_callout" },
  }],
  summary: {
    defect_count: 5,
    total_severity: 12400,
    warning_count: 1,
    warning_severity: 5000,
    conflict_graph: [/* connected overlap components */],
  },
}
```

### Defect Types (fix priority order)

| Type | Severity | What it means | How to fix in HTML |
|---|---|---|---|
| `layout_topology` | 5000 (fixed) | Title center is below body center | Move title div up (`top`) or body div down |
| `font_too_small` | scales with gap | Font below min for priority tier | Increase `font-size` in the element's style |
| `content_overflow` | overflow area px² | Text exceeds container bounds | Increase `height`, decrease `font-size`, or shorten content |
| `out_of_bounds` | overflow px × edge length | Element extends past slide edge | Adjust `left`/`top`/`width`/`height` to stay within 1280×720 |
| `overlap` | area px² (×2 for text) | Two non-decoration elements overlap | Move `owner_eid` in hint direction |

### Reading Hints

Hints tell you **exactly** what CSS value to set:

```
hint.action = "move_down"     →  set top: {suggested_y}px
hint.action = "move_right"    →  set left: {suggested_x}px
hint.action = "increase_font" →  set font-size: {suggested_fontSize}px
hint.action = "increase_height" → set height: {suggested_h}px
hint.action = "shrink_to_fit" →  set width: {suggested_w}px; height: {suggested_h}px
```

Hints use **absolute values** — `suggested_y: 108` means `top: 108px`, not "move by 108px".

### Conflict Graph (Multi-Element Overlaps)

When multiple elements overlap in a chain, the conflict graph shows all connected components with move options:

```typescript
conflict_graph: [{
  eids: ["e_subtitle", "e_title", "e_bullets"],
  edges: [{
    owner_eid: "e_subtitle",
    other_eid: "e_title",
    separations: [
      { direction: "move_down", target_y: 108, cost_px: 28 },  // cheapest
      { direction: "move_left", target_x: -200, cost_px: 240 },
    ],
  }],
  envelopes: [{
    eid: "e_subtitle",
    free_top: 0, free_bottom: 52, free_left: 620, free_right: 660,
  }],
}]
```

**Strategy**: Pick the lowest-cost separation. For chains, coordinate moves — fixing one overlap may resolve adjacent ones.

---

## Slide Dimensions & Constraints

| Constant | Value | What it means |
|---|---|---|
| Slide size | 1280 × 720 px | All elements must fit within these bounds |
| Safe padding | 8px per side | Elements' "safe boxes" are inflated by 8px — overlap is checked on safe boxes, not raw bounding boxes |
| Min overlap area | 100 px² | Overlaps smaller than this are ignored (prevents jitter) |
| Min font (priority ≥ 100) | 32px | Titles |
| Min font (priority ≥ 80) | 20px | Key content (bullets) |
| Min font (priority ≥ 60) | 16px | Secondary text |
| Decoration exemption | — | `decoration` elements never trigger overlap defects |
| Text severity multiplier | 2× | Overlaps involving text elements have doubled severity |
| Topology severity | 5000 | Title-below-body is a high-severity structural defect |

---

## Common Patterns

### Fixing overlap: move the lower-priority element
```
Before: e_subtitle top: 80px  (overlaps e_title which ends at ~100px)
Hint:   suggested_y: 108
Fix:    set e_subtitle's top: 108px
```

### Fixing content overflow: increase container height
```
Before: e_bullets height: 180px (8 bullet items don't fit)
Hint:   suggested_h: 360
Fix:    set e_bullets's height: 360px
```

### Fixing out-of-bounds: pull element inward
```
Before: e_photo left: 1020px, width: 280px → right edge at 1300px (> 1280)
Fix:    set left: 1000px or width: 260px (or both)
```

### Fixing font too small
```
Before: e_source font-size: 10px, priority: 60 → min is 16px
Fix:    set font-size: 16px
```

### Coordinating multi-element fixes
When fixing one element pushes it into another, fix them together:
```
Move e_subtitle down → now overlaps e_bullets
→ Also increase e_bullets top to make room
→ And increase e_bullets height to compensate
```

---

## IR Input Schema (Reference)

The IR is the **input specification** — what the slide should contain. You generate HTML that implements it.

```typescript
{
  slide: { w: 1280, h: 720 },
  elements: [{
    eid: string,            // Unique ID — use this as data-eid in HTML
    type: "title" | "text" | "bullets" | "image" | "decoration",
    priority: number,       // 0–100 (affects overlap ownership + font minimums)
    content: string,        // The text or image URL to render
    layout: {
      x: number,           // Suggested left position (px)
      y: number,           // Suggested top position (px)
      w: number,           // Suggested width (px)
      h: number,           // Suggested height (px)
      zIndex: number,      // Stacking order (default: 10)
    },
    style: {
      fontSize?: number,    // px
      lineHeight?: number,  // ratio (e.g., 1.2)
      color?: string,
      backgroundColor?: string,
      fontWeight?: string | number,
      fontFamily?: string,
      textAlign?: string,
      borderRadius?: number,
      opacity?: number,
      objectFit?: string,   // images only
    },
  }]
}
```

The IR's `layout` and `style` are **suggestions**, not mandates. If the suggested layout has defects (overlaps, overflow, etc.), you should adjust the values in your HTML. The diagnostics engine compares what actually rendered (DOM) against the IR to detect problems.

---

## Debug Tools (Optional)

For visual debugging during development:

```typescript
import { injectDebugOverlay, screenshotSlide } from "./src/index.js";

// Inject colored overlays showing bboxes, safe boxes, and defects
await page.setContent(html, { waitUntil: "load" });
await injectDebugOverlay(page, dom, { diag });
const debugPng = await screenshotSlide(page);
// debugPng shows annotated screenshot with defect highlights
```
