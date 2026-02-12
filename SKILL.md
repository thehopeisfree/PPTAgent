# PPTAgent

**Name:** pptagent

**Description:** Use this skill for any task involving a single 1280×720 HTML slide — creating layouts, resolving overlaps, fixing overflow, ensuring readability. Trigger on mentions of "slide," "layout," "HTML slide," or IR input JSON.

---

## STOP — Read This Before Doing Anything

```
⛔ DO NOT explore /tools/pptagent/dist/ or read source code
⛔ DO NOT write Node.js scripts (no answer.js, no custom imports)
⛔ DO NOT skip the diagnostics loop — always iterate until exit 0
✅ Use ONLY the CLI commands below (node bin/...)
✅ YOU must write the HTML file — it does not already exist
```

---

## Complete Workflow

### Step 1: Plan the layout

Before writing HTML, sketch the slide structure in markdown — element names, types, rough positions, and styles. This prevents forgotten elements and layout rework.

### Step 2: Write the HTML file

Create a file (e.g. `slide.html`) with this template:

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
    <!-- Your elements go here -->
  </div>
</body>
</html>
```

**Element rules** — every element is a `<div>` inside `#slide` with a unique `data-eid`:

| Type | Pattern | Notes |
|------|---------|-------|
| Title/Text | `<div data-eid="e_title">Text</div>` | Bold for titles |
| Bullets | `<div data-eid="e_bullets"><ul style="margin:0;padding-left:1.5em;list-style-type:disc"><li>...</li></ul></div>` | Use real `<ul>/<li>`, not unicode bullets |
| Image | `<div data-eid="e_photo"><img src="..." style="width:100%;height:100%;object-fit:contain" alt=""/></div>` | Always wrap `<img>` in a div |
| Decoration | `<div data-eid="e_accent" style="background-color:#2563eb;"></div>` | Accent bars, shapes |

**Common mistakes:**
- Missing `data-eid` → diagnostics finds 0 elements
- Bare `<img data-eid="...">` without wrapper div → extraction fails
- Unicode bullets (`•`) instead of `<ul><li>` → inconsistent rendering

### Step 3: Flatten to absolute positioning

```bash
cd /tools/pptagent && node bin/flatten.js slide.html abs.html
```

Converts flexbox layout to absolute `left/top/width/height` on every element. After this, only edit `abs.html` — the flatten step is one-way.

### Step 4: Run diagnostics

```bash
cd /tools/pptagent && node bin/check-slide.js abs.html --outdir <rolloutDir> --iter 0
```

- **Exit 0** → no defects. Skip to Step 6.
- **Exit 1** → defects found in JSON on stdout. Go to Step 5.

### Step 5: Fix defects and re-check (LOOP)

This is the critical step. You MUST loop until diagnostics returns exit 0.

```
REPEAT (max 3 iterations):
  1. Read the defect JSON from stdout
  2. For each defect, apply the hint (see tables below)
  3. Edit abs.html with the fixes
  4. Re-run diagnostics with incremented --iter:
     cd /tools/pptagent && node bin/check-slide.js abs.html --outdir <rolloutDir> --iter N
  5. If exit 0 → done, go to Step 6
  6. If exit 1 → go back to substep 1 with the new defects
```

**Fix in this priority order** (higher-priority fixes resolve downstream ones):

| Priority | Defect Type | What's Wrong | How to Fix |
|----------|-------------|-------------|------------|
| 1 | `layout_topology` | Title center below body center | Move title up or body down |
| 2 | `font_too_small` | Font below min for priority tier | Increase `font-size` |
| 3 | `content_overflow` | Text exceeds container | Increase `height`, decrease `font-size`, or shorten content |
| 4 | `content_underflow` | Container much taller than content | Decrease `height` |
| 5 | `out_of_bounds` | Element past slide edge | Adjust `left`/`top`/`width`/`height` to fit 1280×720 |
| 6 | `edge_proximity` | Element too close to slide edge | Move element ≥24px from boundary |
| 7 | `overlap` | Two non-decoration elements overlap | Move `owner_eid` per hint direction |

**Applying hints** — hints are absolute values, NOT deltas. `suggested_y: 108` means set `top: 108px`.

| `hint.action` | CSS to set |
|---------------|------------|
| `move_down` | `top: {suggested_y}px` |
| `move_right` | `left: {suggested_x}px` |
| `increase_font` | `font-size: {suggested_fontSize}px` |
| `increase_height` | `height: {suggested_h}px` |
| `shrink_to_fit` | `width: {suggested_w}px; height: {suggested_h}px` |

**Key rules:**
- Fix `owner_eid` (lower priority), not `other_eid` (higher priority)
- When `hint.validated: true`, the value won't create new defects — apply it directly
- Read ALL defects before editing — one adjustment may fix multiple defects
- Never set `overflow: hidden` — diagnostics needs `overflow: visible`

### Step 6: Convert to PPTX

```bash
cd /tools/pptagent && node bin/to-pptx.js abs.html output.pptx
```

### Step 7: Done

Output artifacts:
- `abs.html` — final validated layout
- `output.pptx` — PowerPoint file
- `<rolloutDir>/render_N.png` — screenshot at each iteration
- `<rolloutDir>/diag_N.json` — diagnostics at each iteration

---

## Slide Constraints

| Constant | Value |
|----------|-------|
| Slide size | 1280 × 720 px |
| Safe padding | 8px per side (overlap checked on inflated boxes) |
| Min overlap area | 100 px² (smaller overlaps ignored) |
| Edge margin | 24px from slide boundary |
| Min font: priority ≥ 100 | 32px |
| Min font: priority ≥ 80 | 20px |
| Min font: priority ≥ 60 | 16px |
| Decoration exemption | Never triggers overlap defects |
| Text severity multiplier | 2× (text overlaps penalized more) |
| Topology severity | 5000 (title below body) |

---

## IR Input (Optional)

If an `input.json` IR file is provided, use it to guide your HTML — match `eid` values as `data-eid`, use suggested positions and styles. If no IR is provided, write HTML directly; the validator auto-infers element types and priorities:

| HTML pattern | Inferred type | Priority |
|---|---|---|
| Contains `<img>`, no text | `image` | 50 |
| Contains `<ul>`/`<ol>` | `bullets` | 60 |
| No text, has background-color | `decoration` | 0 |
| Bold + font ≥ 28px | `title` | 100 |
| Everything else | `text` | 60 |

---

## Deeper Reference

For advanced details (conflict graphs, multi-element chains, IR schema), see `creating.md` and `fixing.md` in the same directory.
