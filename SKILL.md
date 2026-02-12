# PPTAgent

**Name:** pptagent

**Description:** Use this skill for any task involving a single 1280×720 HTML slide — creating layouts, resolving overlaps, fixing overflow, ensuring readability. Trigger on mentions of "slide," "layout," "HTML slide," or IR input JSON.

## Quick Reference

| Task | Guide |
|------|-------|
| Create a slide from scratch | Read `/tools/pptagent/creating.md` |
| Fix layout defects | Read `/tools/pptagent/fixing.md` |
| Convert to PPTX | `cd /tools/pptagent && npx tsx scripts/to-pptx.ts final.html output.pptx` |

## Workflow

```
1. Design layout from slide description (or provided IR input)
2. Write HTML with flexbox layout           → Read creating.md
3. Flatten to absolute positioning          → Read creating.md
4. Validate layout                          → Read fixing.md
5. Fix defects using diagnostic hints       → Read fixing.md
6. Re-validate (repeat 4–5 until clean)
7. Convert to PPTX
```

**Why two phases?** Flexbox produces a reasonable initial layout with less effort. The system flattens it to absolute positioning (mechanical step). Then you fix defects by editing absolute coordinates — each hint is one CSS value to set.

---

## Slide Constraints

| Constant | Value |
|----------|-------|
| Slide size | 1280 × 720 px |
| Safe padding | 8px per side (overlap checked on inflated boxes) |
| Min overlap area | 100 px² (smaller overlaps ignored) |
| Min font: priority ≥ 100 | 32px |
| Min font: priority ≥ 80 | 20px |
| Min font: priority ≥ 60 | 16px |
| Decoration exemption | Never triggers overlap defects |
| Text severity multiplier | 2× (text overlaps penalized more) |
| Topology severity | 5000 (title below body) |

---

## IR Input Schema

The IR specifies what the slide should contain. You generate HTML that implements it.

```json
{
  "slide": { "w": 1280, "h": 720 },
  "elements": [{
    "eid": "e_title",
    "type": "title",
    "priority": 100,
    "content": "Quarterly Results",
    "layout": { "x": 40, "y": 40, "w": 800, "h": 72, "zIndex": 10 },
    "style": { "fontSize": 42, "lineHeight": 1.2, "fontWeight": "bold", "color": "#1e293b" }
  }]
}
```

| Field | Usage |
|-------|-------|
| `eid` | Use as `data-eid` in HTML |
| `type` | `title`, `text`, `bullets`, `image`, `decoration` |
| `priority` | 0–100. Higher = more important. Lower-priority moves in overlaps. |
| `content` | Text to render, or image URL |
| `layout` | Suggested position/size — adjust if diagnostics flags defects |
| `style` | Suggested styling — respect minimum font sizes |

Layout and style are **suggestions**, not mandates. The diagnostics engine compares what actually rendered against the IR.

**Element types:**

| Type | HTML pattern |
|------|-------------|
| `title` | `<div data-eid="...">Title Text</div>` (bold) |
| `text` | `<div data-eid="...">Body text</div>` |
| `bullets` | `<div data-eid="..."><ul><li>...</li></ul></div>` |
| `image` | `<div data-eid="..."><img src="..." style="width:100%;height:100%;object-fit:contain"/></div>` |
| `decoration` | `<div data-eid="..."></div>` (background shapes, accent bars) |

---

## Rollout Artifacts

Save all intermediate files to the **rollout directory** specified in your task instructions:

```
<rolloutDir>/ir_N.json      # IR document
<rolloutDir>/out_N.html     # Rendered HTML
<rolloutDir>/render_N.png   # Screenshot
<rolloutDir>/dom_N.json     # DOM extraction
<rolloutDir>/diag_N.json    # Diagnostics + hints
<rolloutDir>/patch_N.json   # Patch applied
<rolloutDir>/trace.jsonl    # Convergence trace
```

Save at every iteration so the pipeline can track convergence.

---

## CLI Commands

All commands run from `/tools/pptagent`:

```bash
# Flatten flexbox → absolute
cd /tools/pptagent && npx tsx scripts/flatten.ts input.html abs.html

# Validate layout
cd /tools/pptagent && npx tsx scripts/check-slide.ts abs.html input.json

# Convert to PPTX
cd /tools/pptagent && npx tsx scripts/to-pptx.ts final.html output.pptx
```
