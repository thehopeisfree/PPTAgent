# Creating a Slide

## Overview

Plan your slide content in structured markdown first, then write HTML with flexbox layout. After writing, flatten to absolute positioning.

---

## Planning the Layout

Before writing any HTML, plan the slide structure in markdown. Use headings, lists, and tables — not free-form text.

**Example:**

```markdown
## Slide: AI-Driven Stock Analysis

### Elements

| eid | type | content | position | style |
|-----|------|---------|----------|-------|
| e_bg | decoration | dark gradient bar | left strip, full height | #1a1a2e, w: 360px |
| e_title | title | AI-Driven Stock Analysis | top-left, over dark bar | 36px bold, white |
| e_subtitle | text | Q3 2025 Market Overview | below title | 18px, #94a3b8 |
| e_bullets | bullets | 3 key findings (sentiment score, sector rotation, risk flag) | right half, top | 20px, #334155 |
| e_chart | image | chart.png | right half, bottom | 400×240px, object-fit contain |
| e_accent | decoration | accent line | bottom of dark bar | #6366f1, h: 4px |

### Layout Strategy
- Left 1/3: dark vertical bar with title + subtitle stacked
- Right 2/3: bullet findings on top, chart image below
- Accent line at bottom of dark bar for visual polish
```

This forces you to decide element count, types, positions, and styles **before** writing HTML. It also makes the plan reviewable.

⚠️ **Do not skip this step.** Jumping straight to HTML leads to forgotten elements, mismatched `data-eid`s, and layout rework.

---

## HTML Structure

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
      Quarterly Results
    </div>
    <div data-eid="e_bullets" style="font-size: 18px; line-height: 1.5; color: #334155;">
      <ul style="margin: 0; padding-left: 1.5em; list-style-type: disc">
        <li>Revenue up 34%</li>
        <li>Costs down 12%</li>
      </ul>
    </div>
  </div>
</body>
</html>
```

You may use any CSS layout inside `#slide` — flexbox, grid, padding, margins. The system will convert everything to absolute positioning in the flatten step.

---

## Element Rules

Every element is a `<div>` inside `#slide` with a unique `data-eid` matching the IR.

| Type | Pattern | Notes |
|------|---------|-------|
| Title/Text | `<div data-eid="e_title">Text</div>` | Bold for titles |
| Bullets | `<div data-eid="e_bullets"><ul><li>...</li></ul></div>` | `padding-left: 1.5em` on `<ul>` |
| Image | `<div data-eid="e_photo"><img src="..." style="width:100%;height:100%;object-fit:contain" alt=""/></div>` | Always wrap in div |
| Decoration | `<div data-eid="e_accent" style="background-color: #2563eb;"></div>` | Accent bars, shapes |

### Common Mistakes

❌ Missing `data-eid` — diagnostics finds 0 elements:
```html
<div style="font-size: 42px;">Title</div>
```

✅ Always include `data-eid`:
```html
<div data-eid="e_title" style="font-size: 42px;">Title</div>
```

❌ Unicode bullets — inconsistent rendering:
```html
<div data-eid="e_bullets">• Item 1<br>• Item 2</div>
```

✅ Proper list markup:
```html
<div data-eid="e_bullets">
  <ul style="margin: 0; padding-left: 1.5em; list-style-type: disc">
    <li>Item 1</li>
    <li>Item 2</li>
  </ul>
</div>
```

❌ Bare `<img>` tag — no `data-eid` attachment point:
```html
<img data-eid="e_photo" src="photo.jpg" />
```

✅ Wrapper div with `data-eid`:
```html
<div data-eid="e_photo" style="width: 280px; height: 200px;">
  <img src="photo.jpg" style="width: 100%; height: 100%; object-fit: contain" alt="" />
</div>
```

---

## Flatten

After writing your HTML, convert flexbox to absolute positioning:

```bash
cd /tools/pptagent && npx tsx scripts/flatten.ts input.html abs.html
```

This produces `abs.html` where every `data-eid` element has `position: absolute` with computed `left`, `top`, `width`, `height` values. The flattened HTML is what you'll edit in the fixing phase.

⚠️ **After flattening, always work with the absolute-positioned HTML.** Do not edit the original flexbox version — the flatten step is one-way.

---

## After Flattening

The flattened HTML looks like this:

```html
<div id="slide" style="position: relative; width: 1280px; height: 720px; overflow: hidden;">
  <div data-eid="e_title" style="position: absolute; box-sizing: border-box;
       left: 40px; top: 40px; width: 800px; height: 72px; z-index: 10;
       overflow: visible; font-size: 42px; line-height: 1.2;
       font-weight: bold; color: #1e293b;">
    Quarterly Results
  </div>
</div>
```

Key properties on every element after flattening:
- `position: absolute; box-sizing: border-box`
- `left`, `top`, `width`, `height` in px
- `z-index` for stacking (default: 10, decorations use 0)
- `overflow: visible` (required for diagnostics to detect overflow)

Now proceed to validation — read `/tools/pptagent/fixing.md`.
