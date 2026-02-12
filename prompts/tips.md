<!-- This file is injected by the RL framework at runtime. It is NOT included in the PPTAgent tarball. -->

# Tips & Common Pitfalls

## Layout Strategy

**Start from the IR layout, then adjust.** The IR's `layout` values are reasonable starting points. Only deviate when diagnostics flag a defect.

**Fix in priority order:** topology → font → overflow → out_of_bounds → overlap. Fixing a higher-priority defect may resolve downstream ones (e.g., fixing font size may shrink content enough to eliminate overflow).

**Coordinate multi-element moves.** When diagnostics shows a conflict chain (A overlaps B overlaps C), fixing A alone may push it into C. Read the `conflict_graph` in the summary — it shows all connected overlapping elements with cheapest separation directions.

## Must-Know Constraints

| Constraint | Value |
|---|---|
| Slide bounds | 1280 × 720 px — nothing outside this |
| Safe padding | 8px — elements need 8px clearance on each side to avoid overlap detection |
| Min font: priority ≥ 100 (titles) | 32px |
| Min font: priority ≥ 80 (key content) | 20px |
| Min font: priority ≥ 60 (secondary) | 16px |
| Decoration elements | Never trigger overlap defects — don't waste effort moving them |
| Text overlap severity | 2× multiplier — text overlaps are penalized more heavily |

## Common Mistakes

### 1. Forgetting `overflow: visible`
```html
<!-- WRONG: diagnostics can't detect overflow -->
<div data-eid="e1" style="... overflow: hidden;">

<!-- RIGHT: overflow visible, diagnostics detects via Range API -->
<div data-eid="e1" style="... overflow: visible;">
```

### 2. Using unicode bullets instead of `<ul>`/`<li>`
```html
<!-- WRONG: inconsistent rendering -->
<div data-eid="e_bullets">• Item 1<br>• Item 2</div>

<!-- RIGHT: proper list markup -->
<div data-eid="e_bullets">
  <ul style="margin: 0; padding-left: 1.5em; list-style-type: disc">
    <li>Item 1</li>
    <li>Item 2</li>
  </ul>
</div>
```

### 3. Missing `data-eid`
Every element in the IR **must** appear in the HTML with its `data-eid`. If diagnostics reports 0 elements extracted, you probably forgot the attribute.

### 4. Image without wrapper div
```html
<!-- WRONG: img tag directly, no data-eid attachment point -->
<img data-eid="e_photo" src="..." />

<!-- RIGHT: div wrapper with data-eid -->
<div data-eid="e_photo" style="...">
  <img src="..." style="width: 100%; height: 100%; object-fit: contain" alt="" />
</div>
```

### 5. Fixing the wrong element in an overlap
Diagnostics reports `owner_eid` (lower priority, should move) and `other_eid` (higher priority, should stay). Always move `owner_eid`, not `other_eid`.

### 6. Applying hints as deltas
`suggested_y: 108` means **set** `top: 108px`, not **add** 108px to the current value.

## Efficient Fixing

- **Read all defects before changing anything.** Multiple defects may be resolved by a single well-placed adjustment.
- **Follow validated hints.** When `hint.validated: true`, the suggested value has been checked — it won't create new defects.
- **Use the conflict graph.** For overlaps, the `separations` array is sorted by cost. The cheapest direction moves the element the least.
- **Check after each round.** Re-run `check-slide.ts` after fixes — layout changes can cascade.

## Bullets Sizing Rule of Thumb

Each bullet item needs approximately `fontSize × lineHeight` pixels of height. For N items:
```
min_height ≈ N × fontSize × lineHeight + padding
```
Example: 8 items at 18px font, 1.5 line-height → ~216px minimum. If the container is 180px, it will overflow.
