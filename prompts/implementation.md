<!-- This file is injected by the RL framework at runtime. It is NOT included in the PPTAgent tarball. -->

# Implementation: HTML Slide Generation

## Your Task

Given an IR input (content specification), generate an HTML file that renders a 1280×720 slide with all elements correctly positioned — no overlaps, no overflow, no out-of-bounds, correct font sizes, proper visual hierarchy.

## Two-Phase Approach

**Phase 1 — Generate with flexbox.** Write your initial HTML using natural CSS layout (flexbox, padding, margins). This is easier for getting a reasonable first version. Every element must have `data-eid` and be inside `#slide`.

**Phase 2 — Fix with absolute.** After flattening (system converts your flexbox to absolute), you fix defects by editing absolute coordinates. Each diagnostic hint gives you the exact CSS value to set.

## HTML Format (Initial — Flexbox Allowed)

For your initial generation, you may use flexbox on `#slide`:

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
      display: flex;
      flex-direction: column;
      padding: 40px;
    }
  </style>
</head>
<body>
  <div id="slide">
    <div data-eid="e_title" style="font-size: 42px; font-weight: bold; color: #1e293b; margin-bottom: 20px;">
      Team Performance Q3 2025
    </div>
    <!-- ... more elements with data-eid ... -->
  </div>
</body>
</html>
```

## HTML Format (After Flattening — Absolute)

After flattening, all elements use `position: absolute`. This is the format for fixing defects:

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
    <!-- elements go here -->
  </div>
</body>
</html>
```

### Element Rules

Every element is a `<div>` inside `#slide` with:
- `data-eid="..."` — must match the `eid` from the IR
- `position: absolute; box-sizing: border-box`
- `left`, `top`, `width`, `height` in px
- `z-index` for stacking (default: 10)
- `overflow: visible` (so diagnostics can detect overflow)

### Element Type → HTML

**Title / Text:**
```html
<div data-eid="e_title" style="position: absolute; box-sizing: border-box;
     left: 40px; top: 40px; width: 800px; height: 72px; z-index: 10;
     overflow: visible; font-size: 42px; line-height: 1.2;
     font-weight: bold; color: #1e293b;">
  Team Performance Q3 2025
</div>
```

**Bullets:**
```html
<div data-eid="e_bullets" style="position: absolute; box-sizing: border-box;
     left: 40px; top: 140px; width: 560px; height: 300px; z-index: 10;
     overflow: visible; font-size: 18px; line-height: 1.5; color: #334155;">
  <ul style="margin: 0; padding-left: 1.5em; list-style-type: disc">
    <li>First item</li>
    <li>Second item</li>
  </ul>
</div>
```

**Image:**
```html
<div data-eid="e_photo" style="position: absolute; box-sizing: border-box;
     left: 660px; top: 160px; width: 280px; height: 200px; z-index: 10;
     overflow: visible;">
  <img src="photo.jpg" style="width: 100%; height: 100%; object-fit: contain" alt="" />
</div>
```

**Decoration** (background shapes — exempt from overlap checks):
```html
<div data-eid="e_accent" style="position: absolute; box-sizing: border-box;
     left: 0px; top: 0px; width: 12px; height: 720px; z-index: 0;
     overflow: visible; background-color: #2563eb;">
</div>
```

## IR Input (What You Receive)

```json
{
  "slide": { "w": 1280, "h": 720 },
  "elements": [
    {
      "eid": "e_title",
      "type": "title",
      "priority": 100,
      "content": "Team Performance Q3 2025",
      "layout": { "x": 40, "y": 28, "w": 800, "h": 72, "zIndex": 10 },
      "style": { "fontSize": 42, "lineHeight": 1.2, "fontWeight": "bold", "color": "#1e293b" }
    }
  ]
}
```

- `eid` → use as `data-eid`
- `content` → render as text (or `<img src>` for images, `<ul><li>` for bullets)
- `layout` → suggested position/size. Adjust if the layout has defects.
- `style` → suggested styling. Respect minimum font sizes.
- `priority` → higher = more important. In overlaps, the lower-priority element should move.

## Validation Workflow

1. Write your HTML slide (flexbox layout)
2. Flatten: `npx tsx scripts/flatten.ts slide.html abs.html`
3. Validate: `npx tsx scripts/check-slide.ts abs.html input.json`
4. If exit 0: convert to PPTX with `npx tsx scripts/to-pptx.ts abs.html output.pptx`
5. If exit 1: read the diagnostics JSON, fix `abs.html` (now absolute), go to 3

## Diagnostics Output

The checker returns JSON with defects and hints:

```json
{
  "defects": [
    {
      "type": "overlap",
      "owner_eid": "e_subtitle",
      "other_eid": "e_title",
      "severity": 2400,
      "hint": {
        "action": "move_down",
        "validated": true,
        "suggested_y": 108
      }
    }
  ],
  "summary": {
    "defect_count": 3,
    "total_severity": 8400
  }
}
```

### Defect Types

| Type | What to fix |
|---|---|
| `layout_topology` | Title center is below body center → move title up or body down |
| `font_too_small` | Font below minimum for priority tier → increase `font-size` |
| `content_overflow` | Text overflows container → increase `height` or decrease `font-size` |
| `out_of_bounds` | Element past slide edges → adjust position/size to fit 1280×720 |
| `overlap` | Two elements overlap → move `owner_eid` per hint direction |

### Reading Hints

Hints give you the exact CSS value to set:
- `suggested_y: 108` → set `top: 108px` on that element
- `suggested_x: 200` → set `left: 200px`
- `suggested_fontSize: 20` → set `font-size: 20px`
- `suggested_h: 360` → set `height: 360px`

These are **absolute values**, not deltas.
