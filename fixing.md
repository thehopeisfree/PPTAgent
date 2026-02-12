# Fixing Layout Defects

## Running Diagnostics

After flattening, validate your layout:

```bash
cd /tools/pptagent && npx tsx scripts/check-slide.ts abs.html --outdir <rolloutDir> --iter 0
```

No `input.json` needed — element types and priorities are auto-inferred from the rendered HTML.

- **Exit 0** — no defects. Proceed to PPTX conversion.
- **Exit 1** — defects found. JSON output on stdout contains defects and hints.

---

## Diagnostics Output

```json
{
  "defects": [{
    "type": "overlap",
    "owner_eid": "e_bullets",
    "other_eid": "e_title",
    "severity": 2400,
    "details": { "overlap_area_px": 1200 },
    "hint": {
      "action": "move_down",
      "validated": true,
      "suggested_y": 108
    }
  }],
  "warnings": [{
    "type": "occlusion_suspected",
    "owner_eid": "e_callout",
    "other_eid": "e_photo",
    "details": { "overlap_area_px": 5000, "top_eid": "e_callout" }
  }],
  "summary": {
    "defect_count": 5,
    "total_severity": 12400,
    "warning_count": 1,
    "warning_severity": 5000,
    "conflict_graph": []
  }
}
```

- `owner_eid` = lower-priority element (**you fix this one**)
- `other_eid` = higher-priority element (leave it alone)
- `warnings` are informational only — they don't count toward defect metrics

---

## Defect Types

Fix in this order — higher-priority fixes often resolve downstream ones.

| Type | Severity | What's wrong | How to fix |
|------|----------|-------------|------------|
| `layout_topology` | 5000 (fixed) | Title center below body center | Move title up or body down |
| `font_too_small` | scales with gap | Font below min for priority tier | Increase `font-size` |
| `content_overflow` | overflow area px² | Text exceeds container | Increase `height`, decrease `font-size`, or shorten content |
| `out_of_bounds` | overflow × edge length | Element past slide edge | Adjust `left`/`top`/`width`/`height` to fit 1280×720 |
| `overlap` | area px² (×2 for text) | Two non-decoration elements overlap | Move `owner_eid` per hint direction |

---

## Reading Hints

Hints tell you **exactly** what CSS value to set:

| `hint.action` | What to set |
|---------------|-------------|
| `move_down` | `top: {suggested_y}px` |
| `move_right` | `left: {suggested_x}px` |
| `increase_font` | `font-size: {suggested_fontSize}px` |
| `increase_height` | `height: {suggested_h}px` |
| `shrink_to_fit` | `width: {suggested_w}px; height: {suggested_h}px` |

⚠️ **Hints are absolute values.** `suggested_y: 108` means set `top: 108px` — not "add 108px".

When `hint.validated: true`, the suggested value has been checked — it won't create new defects. Follow validated hints directly.

---

## Fix Patterns

### Overlap — move the lower-priority element

```
Before: e_subtitle top: 80px  (overlaps e_title which ends at ~100px)
Hint:   suggested_y: 108
Fix:    set e_subtitle's top: 108px
```

### Content overflow — increase container height

```
Before: e_bullets height: 180px (8 items don't fit)
Hint:   suggested_h: 360
Fix:    set e_bullets's height: 360px
```

### Out-of-bounds — pull element inward

```
Before: e_photo left: 1020px, width: 280px → right edge at 1300px (> 1280)
Fix:    set left: 1000px or width: 260px (or both)
```

### Font too small

```
Before: e_source font-size: 10px, priority: 60 → min is 16px
Fix:    set font-size: 16px
```

### Multi-element chain

When fixing one element pushes it into another, fix them together:

```
Move e_subtitle down → now overlaps e_bullets
→ Also increase e_bullets top to make room
→ And increase e_bullets height to compensate
```

---

## Conflict Graph

When multiple elements overlap in a chain, the `conflict_graph` in the summary shows connected components with move options:

```json
{
  "eids": ["e_subtitle", "e_title", "e_bullets"],
  "edges": [{
    "owner_eid": "e_subtitle",
    "other_eid": "e_title",
    "separations": [
      { "direction": "move_down", "target_y": 108, "cost_px": 28 },
      { "direction": "move_left", "target_x": -200, "cost_px": 240 }
    ]
  }],
  "envelopes": [{
    "eid": "e_subtitle",
    "free_top": 0, "free_bottom": 52, "free_left": 620, "free_right": 660
  }]
}
```

**Strategy**: Pick the lowest-cost separation. `cost_px` is how far the element moves — lower is better. For chains, coordinate moves so fixing one overlap doesn't create another.

---

## Common Mistakes

1. **Fixing `other_eid` instead of `owner_eid`** — diagnostics tells you which element to move. Always move `owner_eid` (lower priority), not `other_eid` (higher priority).

2. **Applying hints as deltas** — `suggested_y: 108` means **set** `top: 108px`, not **add** 108px to current value.

3. **Fixing one defect at a time** — read all defects first. Multiple defects may be resolved by a single well-placed adjustment.

4. **Setting `overflow: hidden`** — diagnostics can't detect content overflow when overflow is hidden. Always use `overflow: visible`.

5. **Ignoring the conflict graph** — for multi-element overlaps, the separations array is sorted by cost. The cheapest direction moves the element the least.

---

## Verification Loop

After applying fixes, re-run diagnostics (increment `--iter`):

```bash
cd /tools/pptagent && npx tsx scripts/check-slide.ts abs.html --outdir <rolloutDir> --iter 1
```

Repeat until exit code 0. Layout changes can cascade — always re-validate after edits.
