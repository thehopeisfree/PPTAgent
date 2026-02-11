# AGENTS v2.5 — Slide Layout Self-Refinement System

**Status:** Implementation-Ready Spec · 2026-02-10

---

## 0) Goal (MVP)

Build a tight, debuggable refinement loop for single-slide layout, compensating for LLM spatial weaknesses via **calculated diagnostics with math hints**.

```
LLM ──JSON Patch──→ IR ──HTML──→ Playwright Render
 ↑                                      ↓
 └── Defects + Hints ←── Diagnostics ←── DOM Extraction
```

**Hypothesis:** LLMs struggle with absolute pixel arithmetic. By providing structured diagnostics (e.g., "overflow 42px") combined with calculated hints (e.g., `"suggested_h": 550`), we achieve layout correctness within 1–3 steps.

**MVP Scope:**
- Single slide (1280×720)
- Fixed element set (no add/remove/split/merge)
- Z-Index layering support (backgrounds vs content)
- Safe Zone padding to ensure visual breathing room

**Explicit Out-of-Scope:** Color contrast / readability (e.g., dark text on dark background). This system detects layout defects only; visual style issues are not detected or corrected.

### Global Constants

| Constant              | Default | Description                                              |
|-----------------------|---------|----------------------------------------------------------|
| `SLIDE_W`             | 1280    | Slide width (px)                                         |
| `SLIDE_H`             | 720     | Slide height (px)                                        |
| `SAFE_PADDING`        | 8       | SafeBox inflation per side (px)                          |
| `MIN_OVERLAP_AREA_PX` | 100     | Minimum overlap area to report (px²), avoids jitter loops |
| `OOB_EPS_PX`          | 1       | Out-of-bounds tolerance (px)                             |
| `HINT_BUFFER_PX`      | 8       | Buffer added to hint suggestions (px)                    |
| `MAX_ITER`            | 3       | Maximum refinement iterations                            |
| `STALL_THRESHOLD`     | 2       | Consecutive non-improving iterations to trigger rollback |
| `HIGH_PRIO_SIZE_BUDGET` | 0.15  | Max single-patch ratio change for size properties (w, h, fontSize, lineHeight) on priority ≥ 80 |
| `HIGH_PRIO_MOVE_PX`  | 48      | Max single-patch absolute move for position properties (x, y) on priority ≥ 80 |
| `ALLOW_HIDE`          | false   | Whether Hard Fallback may set `display: none` on elements |
| `TEXT_OVERLAP_SEVERITY_MULT` | 2 | Severity multiplier when overlap involves text elements  |
| `TOPOLOGY_SEVERITY`  | 5000    | Fixed severity for layout topology violations (structural) |

### Coordinate System

**All spatial values** (`bbox`, `contentBox`, `safeBox`, `layout`) use **slide-local coordinates**: origin (0, 0) at the top-left corner of the slide container. DOM extraction MUST subtract the slide container's viewport offset before recording any coordinates. This ensures correctness regardless of page margin, scale, or devicePixelRatio.

---

## 1) IR Schema

Each element in `ir_k.json`:

| Field      | Type   | Description                                         |
|------------|--------|-----------------------------------------------------|
| `eid`      | string | Stable unique ID, e.g. `e_title_001`                |
| `type`     | string | `title` / `bullets` / `image` / `text` / `decoration` |
| `priority` | 0–100  | Determines which element yields in conflicts (§2)   |
| `content`  | string | Text content or image src                           |
| `layout`   | object | `{ x, y, w, h, zIndex }` in px. `zIndex` default 10 |
| `style`    | object | `{ fontSize, lineHeight, ... }`                     |

Rules:
- `eid` embedded in HTML as `data-eid="..."`, stable across iterations.
- All diagnostics and patches reference only `eid`.
- `type: "decoration"` is exempt from overlap detection (treated as background).
- `zIndex: 0` for backgrounds/decorations, `zIndex: 10+` for content elements.

Example:
```json
{
  "slide": { "w": 1280, "h": 720 },
  "elements": [
    {
      "eid": "e_bg_001",
      "type": "decoration",
      "priority": 20,
      "content": "",
      "layout": { "x": 0, "y": 0, "w": 400, "h": 720, "zIndex": 0 },
      "style": { "backgroundColor": "#f0f0f0" }
    },
    {
      "eid": "e_title_001",
      "type": "title",
      "priority": 100,
      "content": "Key Findings",
      "layout": { "x": 48, "y": 32, "w": 1184, "h": 80, "zIndex": 10 },
      "style": { "fontSize": 44, "lineHeight": 1.2 }
    },
    {
      "eid": "e_bullets_002",
      "type": "bullets",
      "priority": 80,
      "content": "• Point A\n• Point B\n• Point C",
      "layout": { "x": 64, "y": 140, "w": 820, "h": 520, "zIndex": 10 },
      "style": { "fontSize": 22, "lineHeight": 1.5 }
    }
  ]
}
```

---

## 2) Priority, Font Thresholds & Budget

| Priority | Element Type            | Min Font (px) |
|----------|-------------------------|---------------|
| 100      | Title / Key Takeaway    | 32            |
| 80       | Key Bullets             | 20            |
| 60       | Supporting Text         | 16            |
| 40       | Images                  | —             |
| 20      | Decorative / Background | —             |

### Hard Constraints
- Never reduce text below its Min Font.
- If layout is impossible at Min Font, trigger Hard Fallback (§7).

### High-Priority Budget (priority ≥ 80)

High-priority elements may be adjusted, but with guardrails to prevent over-degradation. **Budget rules differ by property type:**

**Size properties** (w, h, fontSize, lineHeight): ratio-based.
Any single size property may change by at most `HIGH_PRIO_SIZE_BUDGET` (default 15%) of its current value per patch.

| Property | Current | Min (one patch) | Max (one patch) |
|----------|---------|-----------------|-----------------|
| fontSize | 44      | 44 × 0.85 = 37  | 44 × 1.15 = 51  |
| layout.h | 80      | 80 × 0.85 = 68  | 80 × 1.15 = 92  |

**Position properties** (x, y): absolute-based.
Any single position property may change by at most `HIGH_PRIO_MOVE_PX` (default 48px) per patch.

| Property | Current | Min (one patch)  | Max (one patch)  |
|----------|---------|------------------|------------------|
| layout.y | 32      | 32 − 48 = 0*    | 32 + 48 = 80     |
| layout.x | 48      | 48 − 48 = 0     | 48 + 48 = 96     |

*Clamped to 0 (slide bound).

**Rationale:** Ratio budgets work for size properties because the perceptual impact of a change scales with the value (shrinking a 44px title by 7px is noticeable; shrinking a 200px image by 7px is not). But for position, a title at `y=32` and one at `y=400` should have comparable freedom to move — ratio budgets would make near-origin elements nearly immovable.

The `apply_patch` step MUST clamp edits that exceed the applicable budget and record the override in trace. Across multiple iterations, the cumulative effect can exceed one step's budget, but each single step is bounded.

Low-priority elements (priority < 80) have no budget constraint — they can be freely adjusted within slide bounds and Min Font limits.

---

## 3) File Structure Per Rollout

```
rollouts/rollout_XXXX/
├── input.json              # Original content input
├── ir_0.json               # Initial IR
├── out_0.html              # Rendered HTML (iteration 0)
├── render_0.png            # Screenshot
├── dom_0.json              # DOM extraction
├── diag_0.json             # Diagnostics + hints
├── patch_1.json            # LLM patch → iteration 1
├── ir_1.json               # Patched IR
├── out_1.html
├── render_1.png
├── dom_1.json
├── diag_1.json
├── ...                     # Up to iteration N
└── trace.jsonl             # Convergence log
```

### trace.jsonl

Basic format — one line per iteration:
```json
{ "iter": 0, "defect_count": 3, "total_severity": 2482, "warning_count": 1, "defect_types": ["content_overflow","overlap","font_too_small"], "action": "patch" }
{ "iter": 1, "defect_count": 1, "total_severity": 320, "warning_count": 0, "defect_types": ["content_overflow"], "action": "patch" }
{ "iter": 2, "defect_count": 0, "total_severity": 0, "warning_count": 0, "defect_types": [], "action": "stop_success" }
```

Extended format (recommended):
```json
{
  "iter": 1,
  "defect_count": 1,
  "total_severity": 320,
  "warning_count": 1,
  "defect_types": ["out_of_bounds"],
  "warning_types": ["occlusion_suspected"],
  "action": "patch",
  "applied_hints": [
    { "eid": "e_bullets_002", "action": "resize_height", "suggested_h": 570 }
  ],
  "overrides": [
    { "eid": "e_title_001", "field": "layout.y", "requested": 90, "clamped_to": 80, "reason": "HIGH_PRIO_MOVE_PX exceeded (max 48px from current 32)" }
  ]
}
```

---

## 4) DOM Extraction (Playwright)

Extract for each `[data-eid]`:

| Field          | Description                                              |
|----------------|----------------------------------------------------------|
| `eid`          | Element ID                                               |
| `bbox`         | `{ x, y, w, h }` via `getBoundingClientRect`, slide-local |
| `safeBox`      | `bbox` inflated by `SAFE_PADDING` per side               |
| `contentBox`   | Union bounding box of actual text content via Range API, slide-local |
| `zIndex`       | Computed CSS z-index                                     |
| `computed`     | Minimal computed style fields: `{ fontSize, lineHeight }` |

### Text Measurement: Range API with Union Rect (Required)

Do **not** use `scrollHeight` for overflow detection. `scrollHeight` is unreliable when `line-height` is large — it reports phantom overflow (container appears overflowed even when text fits visually).

Use the Range API with `getClientRects()` union to handle multi-line text, `<li>` elements, inline spans, and line breaks correctly:

```javascript
// Playwright: inject into page context
function measureContent(element, slideRect) {
  const range = document.createRange();
  range.selectNodeContents(element);

  // Union all client rects for accurate multi-line measurement
  const rects = Array.from(range.getClientRects());
  if (rects.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }

  // Convert to slide-local coordinates
  const container = element.getBoundingClientRect();
  return {
    contentBox: {
      x: minX - slideRect.x,
      y: minY - slideRect.y,
      w: maxX - minX,
      h: maxY - minY
    },
    bbox: {
      x: container.x - slideRect.x,
      y: container.y - slideRect.y,
      w: container.width,
      h: container.height
    }
  };
}

// Usage: slideRect = document.querySelector('#slide').getBoundingClientRect();
```

Overflow is detected as: `contentBox.h > bbox.h` or `contentBox.w > bbox.w`.

### Example `dom_k.json`:
```json
{
  "slide": { "w": 1280, "h": 720 },
  "safe_padding": 8,
  "elements": [
    {
      "eid": "e_title_001",
      "bbox": { "x": 48, "y": 32, "w": 1184, "h": 80 },
      "safeBox": { "x": 40, "y": 24, "w": 1200, "h": 96 },
      "contentBox": { "x": 48, "y": 34, "w": 620, "h": 50 },
      "zIndex": 10,
      "computed": { "fontSize": 44, "lineHeight": 1.2 }
    },
    {
      "eid": "e_bullets_002",
      "bbox": { "x": 64, "y": 140, "w": 820, "h": 520 },
      "safeBox": { "x": 56, "y": 132, "w": 836, "h": 536 },
      "contentBox": { "x": 64, "y": 142, "w": 810, "h": 562 },
      "zIndex": 10,
      "computed": { "fontSize": 22, "lineHeight": 1.5 }
    }
  ]
}
```

---

## 5) Diagnostics Engine

The diagnostics engine detects defects and generates **math hints** so the LLM doesn't have to do pixel arithmetic.

### 5.1 Defect Types

| Type               | Trigger                                                                    | Details                          | Hint                                       |
|--------------------|----------------------------------------------------------------------------|----------------------------------|--------------------------------------------|
| `layout_topology`  | Title element center-y > body (bullets/text) element center-y              | `rule`, `title_eid`, `body_eid`, `title_cy`, `body_cy` | `move_to_top` with `suggested_y`  |
| `content_overflow` | `contentBox.h > bbox.h` OR `contentBox.w > bbox.w`                         | `overflow_x_px`, `overflow_y_px` | `suggested_h` / `suggested_w` (+ buffer)   |
| `out_of_bounds`    | bbox exceeds slide bounds beyond `OOB_EPS_PX`                             | `edge`, `by_px`                  | `suggested_x/y` and/or `suggested_w/h`     |
| `overlap`          | safeBox intersection area ≥ `MIN_OVERLAP_AREA_PX`, same zIndex, neither is `decoration` | `other_eid`, `overlap_area_px`   | `suggested_move` (direction + target value) |
| `font_too_small`   | `computed.fontSize < min_threshold` for element's priority                 | `current`, `min`                 | `suggested_fontSize`                       |

### 5.2 Warning Types

Warnings are informational signals. They appear in `diag_k.json` but do **not** count toward `defect_count` or `total_severity`, and do **not** trigger stall detection. Warnings **do** affect the final `quality` label (§8).

| Warning                | Trigger                                                                                      | Details                             |
|------------------------|----------------------------------------------------------------------------------------------|-------------------------------------|
| `occlusion_suspected`  | safeBox intersection area ≥ `MIN_OVERLAP_AREA_PX`, **different** zIndex, neither is `decoration` | `other_eid`, `overlap_area_px`, `top_eid` (higher zIndex element) |

### 5.3 Overlap Rules

1. `type == "decoration"` elements are **exempt** from all overlap/occlusion checks.
2. Same zIndex + non-decoration → `overlap` (hard defect, must fix).
3. Different zIndex + non-decoration + area ≥ threshold → `occlusion_suspected` (warning only).
4. Overlap area < `MIN_OVERLAP_AREA_PX` (default 100px²) is ignored entirely.

### 5.4 Owner Assignment

For pairwise defects (`overlap`) and warnings (`occlusion_suspected`), diagnostics MUST assign:
- `owner_eid`: the **lower-priority** element (default candidate for adjustment).
- `other_eid`: the higher-priority element (context reference).

The LLM should default to adjusting `owner_eid`. It may adjust `other_eid` (higher-priority) when doing so produces a globally better layout, subject to the applicable budget (§2).

### 5.5 Conflict Chain & Coordinated Hints

When multiple defects form a priority cascade (A crowds B, B crowds C), diagnostics:
1. Reports the chain in `summary.conflict_chain`.
2. **Pre-computes coordinated hints** for all chain members, so the LLM only needs to apply values.

**Computation:** Iterate from chain head (highest priority) downward. Each element's `suggested_y` is derived from the previous element's safeBox bottom edge.

**Chain-tail bounds check:** If the computed position for the tail element would place it out of bounds, the diagnostics engine MUST automatically introduce compression actions for upstream elements before finalizing hints:
- Reduce `suggested_h` on lower-priority chain members (respecting Min Font for text).
- Clamp image heights.
- As a last resort, flag the chain as `"chain_feasible": false` — the LLM must then apply creative judgment, and Hard Fallback (§7) may be needed.

Example (feasible chain):
```json
{
  "conflict_chain": ["e_title_001", "e_bullets_002", "e_img_003"],
  "chain_feasible": true,
  "chain_hints": [
    { "eid": "e_title_001", "action": "keep" },
    { "eid": "e_bullets_002", "action": "move_down", "suggested_y": 120, "validated": true },
    { "eid": "e_img_003", "action": "move_down_and_shrink", "suggested_y": 580, "suggested_h": 130, "validated": true }
  ]
}
```

Example (infeasible chain — not enough vertical space):
```json
{
  "conflict_chain": ["e_title_001", "e_bullets_002", "e_img_003"],
  "chain_feasible": false,
  "chain_hints": [
    { "eid": "e_title_001", "action": "keep" },
    { "eid": "e_bullets_002", "action": "move_down", "suggested_y": 120, "validated": true },
    { "eid": "e_img_003", "action": "needs_creative_solution", "reason": "suggested_y(660) + min_h(100) > SLIDE_H(720)" }
  ]
}
```

### 5.6 Hint Validation & Idempotency

- Diagnostics SHOULD pre-validate hints by clamping to slide safe zone, ensuring non-negative sizes, and respecting budgets. Validated hints are marked `"validated": true`.
- **Idempotency requirement:** A validated hint MUST be computed against the **target state** (not a delta from current state). Applying a validated hint and then re-running diagnostics MUST NOT produce the same hint in the same direction. This prevents drift/oscillation.
- The `apply_patch` step may trust validated hints directly. Unvalidated hints require re-checking and clamping.

### 5.7 Default Fix Priority Order

When multiple defect types coexist, resolve in this order:

1. **`layout_topology`** — restore structural reading order first (e.g., title above body).
2. **`font_too_small`** — restore minimum readability.
3. **`content_overflow`** — fix via increase_h / reduce fontSize (within budget) / line-clamp.
4. **`out_of_bounds`** — fix via move_in / shrink, clamp to safe zone.
5. **`overlap`** — fix via move `owner_eid` / resize / shrink font on lower-priority.

Rationale: Topology fixes restore semantic structure; font and overflow fixes change element sizes, which can resolve or shift overlaps. Fixing overlap first risks wasted work.

### 5.8 Total Severity

Each defect contributes a raw severity value to `total_severity`:

| Defect Type        | Severity Contribution                      |
|--------------------|--------------------------------------------|
| `content_overflow` | `overflow_x_px + overflow_y_px`            |
| `out_of_bounds`    | `by_px`                                    |
| `overlap`          | `overlap_area_px` × multiplier (see below) |
| `font_too_small`   | `(min - current) × 10`                     |

**Overlap severity multiplier:** If either element in the overlap pair has `type ∈ {title, text, bullets}`, multiply the overlap severity by `TEXT_OVERLAP_SEVERITY_MULT` (default 2). Rationale: text occlusion destroys readability and is perceptually more severe than image-image overlap.

`total_severity = sum of all defect severities`. Reported in every `diag_k.json` summary and every trace line.

### 5.9 Layout Topology Detection

The `layout_topology` defect detects violations of semantic reading order: a title element's center-y must not be below any body element's (bullets/text) center-y. This uses pure relative-position comparison with no magic pixel thresholds.

- **Severity:** Fixed at `TOPOLOGY_SEVERITY` (5000) — structural issues are far more severe than pixel-level defects.
- **Body types:** Only `bullets` and `text` count as body. `image` and `decoration` are excluded.
- **Strict comparison:** `title_cy > body_cy` (equal center-y is not a violation).
- **Hint:** `move_to_top` with `suggested_y` placing the title above the body element.

### 5.10 Anti-Repeat Memory (Patch Fingerprinting)

To prevent the LLM from repeating failed strategies after rollback, the driver maintains a **taboo list** of patch fingerprints:

- **Fingerprint computation:** Each patch edit generates direction signatures (e.g., `eid:move:down`, `eid:resize_w:shrink`, `eid:font:decrease`). Signatures are sorted, deduplicated, and joined with `|`.
- **Recording:** When `stepRollout` detects a non-improving iteration (both defect_count and total_severity did not improve), the patch fingerprint is added to the session's taboo set.
- **Checking:** Callers invoke `checkPatch(session, patch)` before `stepRollout`. If the fingerprint matches a taboo entry, `{ allowed: false, reason, fingerprint }` is returned.
- **Scope:** Taboo fingerprints are per-session (per-rollout). They are included in `RolloutMetrics.taboo_fingerprints` for tracing.

### 5.11 Example `diag_k.json`

```json
{
  "defects": [
    {
      "type": "content_overflow",
      "eid": "e_bullets_002",
      "severity": 42,
      "details": {
        "overflow_x_px": 0,
        "overflow_y_px": 42
      },
      "hint": {
        "action": "resize_height",
        "suggested_h": 570,
        "reason": "contentBox.h(562) + HINT_BUFFER_PX(8)",
        "validated": true
      }
    },
    {
      "type": "overlap",
      "owner_eid": "e_bullets_002",
      "other_eid": "e_title_001",
      "severity": 3680,
      "details": {
        "overlap_area_px": 1840,
        "severity_note": "×2 (text involved)"
      },
      "hint": {
        "action": "move_down",
        "target_eid": "e_bullets_002",
        "suggested_y": 120,
        "reason": "clear title safeBox bottom edge",
        "validated": true
      }
    },
    {
      "type": "font_too_small",
      "eid": "e_bullets_002",
      "severity": 40,
      "details": {
        "current": 16,
        "min": 20
      },
      "hint": {
        "action": "set_fontSize",
        "suggested_fontSize": 20,
        "validated": true
      }
    }
  ],
  "warnings": [
    {
      "type": "occlusion_suspected",
      "owner_eid": "e_caption_004",
      "other_eid": "e_img_003",
      "details": {
        "overlap_area_px": 320,
        "top_eid": "e_caption_004"
      }
    }
  ],
  "summary": {
    "defect_count": 3,
    "total_severity": 3762,
    "warning_count": 1,
    "conflict_chain": ["e_title_001", "e_bullets_002"],
    "chain_feasible": true,
    "chain_hints": [
      { "eid": "e_title_001", "action": "keep" },
      { "eid": "e_bullets_002", "action": "move_down", "suggested_y": 120, "validated": true }
    ]
  }
}
```

---

## 6) Patch Format

Model outputs structured patch JSON. `layout` and `style` are separate namespaces.

```json
{
  "edits": [
    {
      "eid": "e_bullets_002",
      "layout": { "y": 120, "h": 570 },
      "style": { "fontSize": 20 }
    },
    {
      "eid": "e_img_003",
      "layout": { "x": 940, "w": 300, "h": 420 }
    }
  ],
  "constraints": { "no_add_remove": true }
}
```

**Apply logic:**
1. Shallow-merge `layout` and `style` fields into the current IR. Unmentioned fields are preserved.
2. **Clamp** edits on priority ≥ 80 elements:
   - Size properties (w, h, fontSize, lineHeight): ≤ `HIGH_PRIO_SIZE_BUDGET` (15%) change per patch.
   - Position properties (x, y): ≤ `HIGH_PRIO_MOVE_PX` (48px) change per patch.
3. Record any clamping in trace `overrides`.
4. Re-render HTML after applying.

**LLM prompting guidance:**
- When `chain_hints` are present and `chain_feasible: true`, apply them as a batch.
- When `chain_feasible: false`, apply available hints and use creative judgment for the flagged element.
- For non-chain defects, apply individual validated `hint` values directly.
- Follow the fix priority order (§5.7): font → overflow → out_of_bounds → overlap.

---

## 7) Refinement Policy & Fallbacks

### Step 1: Apply Hints
If diagnostics provide validated hints (individual or `chain_hints`), apply them directly.

### Step 2: Conflict Resolution (soft priority with budget)
Default strategy is to adjust `owner_eid` (lower-priority element):
1. **Move** to available whitespace.
2. **Resize** (shrink images).
3. **Shrink font** down to Min Font (§2).

The LLM may adjust higher-priority elements when it produces a globally better layout, subject to budgets (§2). The apply_patch step enforces this — the LLM does not need to self-police.

### Step 3: Hard Fallback
If `iter == MAX_ITER` and defects persist, apply deterministic fallbacks in order:

| Fallback     | Target                                        | Condition         | Action                                            |
|--------------|-----------------------------------------------|-------------------|---------------------------------------------------|
| **Truncate** | Overflowing text elements                     | Always available  | Apply `overflow: hidden; text-overflow: ellipsis`  |
| **Hide**     | Lowest priority element still causing issues  | `ALLOW_HIDE=true` | Set `display: none` (Decoration first, then Image) |
| **Alert**    | Entire rollout                                | Always            | Mark as `"quality": "degraded"` in trace.jsonl     |

- `ALLOW_HIDE` defaults to **false**. When false, only Truncate + Alert are used. Enable for offline evaluation / ablation.
- Hard fallbacks guarantee the output never looks worse than a cleanly truncated slide.

---

## 8) Stopping Criteria

Stop when ANY of:
1. **Success:** `defect_count == 0`
2. **Max iterations:** `iter >= MAX_ITER` → apply Hard Fallback (§7)
3. **Stall:** For `STALL_THRESHOLD` (default 2) consecutive iterations, **both** `defect_count` did not decrease **and** `total_severity` did not decrease → rollback to best previous `ir_k.json` and stop

On rollback, keep the iteration with lowest `total_severity` (tie-break: lowest `defect_count`) as final output.

Note: `warning_count` does NOT factor into stall detection or stopping criteria.

### Quality Labels (3-tier)

The final quality of each rollout is classified as:

| Quality                  | Condition                                              |
|--------------------------|--------------------------------------------------------|
| `success_clean`          | `defect_count == 0` AND `warning_count == 0`           |
| `success_with_warnings`  | `defect_count == 0` AND `warning_count > 0`            |
| `degraded`               | `defect_count > 0` (Hard Fallback applied or stall rollback) |

**Rationale:** `success_with_warnings` prevents rollouts with unresolved `occlusion_suspected` warnings from being mixed into the "clean success" training set. Downstream consumers (RL training, evaluation dashboards) should treat these tiers distinctly.

**Metrics collected per rollout:**

| Metric                      | Description                                  |
|-----------------------------|----------------------------------------------|
| `defect_count_per_iter`     | Array of defect counts                       |
| `total_severity_per_iter`   | Array of total severity values               |
| `warning_count_per_iter`    | Array of warning counts                      |
| `iterations_to_converge`    | Number of iterations used                    |
| `final_defect_types`        | Remaining defect types (if any)              |
| `final_warning_types`       | Remaining warning types (if any)             |
| `quality`                   | `success_clean` / `success_with_warnings` / `degraded` |
| `budget_overrides`          | Number of times budget was enforced          |

---

## 9) Implementation Order

1. **IR Schema** — `eid`, `priority`, `layout`/`style` separation, `zIndex`
2. **Playwright DOM Extraction** — bbox, safeBox, **contentBox via Range API `getClientRects()` union**, zIndex, computed styles, **all in slide-local coordinates**
3. **Diagnostics Engine:**
   - content_overflow (using contentBox) / out_of_bounds / overlap / font_too_small
   - `occlusion_suspected` warning (cross-zIndex)
   - SafeBox intersection with `MIN_OVERLAP_AREA_PX` filter
   - Owner assignment + conflict chain detection
   - **Coordinated chain_hints** with tail bounds check + compression fallback
   - Individual hint calculator with validation + idempotency
   - `total_severity` with `TEXT_OVERLAP_SEVERITY_MULT`
   - Fix priority order (§5.7)
4. **Patch Schema + apply_patch** — layout/style merge, **dual budget clamping** (size ratio + position absolute), override logging
5. **Loop Driver** — dual-metric stall detection, rollback to best `ir_k`, hard fallback (`ALLOW_HIDE` gated), **3-tier quality labeling**, trace logging

---

## Appendix A: Deferred Enhancements

| Item                              | Rationale                                               |
|-----------------------------------|---------------------------------------------------------|
| Natural language context injection | Structured hints likely sufficient; ROI uncertain       |
| Multi-slide support               | Out of MVP scope                                        |
| Element add/remove/split          | Out of MVP scope                                        |
| `move_to` hint (whitespace finder) | Useful for multi-element slides; requires bin-packing logic; revisit when element count > 5 |

## Appendix B: Long-term Roadmap

**Group nodes / Scene Graph IR:** When supporting complex slides (multi-card layouts, figure+caption groups), the IR should evolve to support hierarchical `group` nodes with local coordinate systems:

```json
{
  "eid": "g_card_001",
  "type": "group",
  "layout": { "x": 100, "y": 200 },
  "children": ["e_card_title", "e_card_icon", "e_card_desc"]
}
```

Children use coordinates relative to the group. Moving a group moves all children. This reduces patch complexity for the LLM and preserves internal spatial relationships. Not needed for MVP's 3–5 flat elements, but a natural evolution path when element count and layout complexity increase.

## Appendix C: Suggested Experiments

### Experiment 1: zIndex Overlap Rule Ablation

To determine if `occlusion_suspected` should be promoted to a hard defect:

1. Construct 30+ slides where two non-decoration content elements have different zIndex values and their bounding boxes intersect.
2. Run with two configurations:
   - **Config A (v2.5):** Cross-zIndex overlap = warning only.
   - **Config B:** Cross-zIndex overlap = hard defect.
3. Measure: defect recall, convergence steps, final visual quality (screenshot + human spot check).

### Experiment 2: HIGH_PRIO_SIZE_BUDGET Sensitivity

Test `HIGH_PRIO_SIZE_BUDGET` at 0.10, 0.15, 0.20 and `HIGH_PRIO_MOVE_PX` at 32, 48, 64 to find the sweet spot between layout flexibility and visual stability.

### Experiment 3: Range API vs scrollHeight

Construct slides with varying `line-height` values (1.2, 1.5, 2.0). Compare overflow detection accuracy between Range API `contentBox` and `scrollHeight`. Measure phantom overflow rate.

### Experiment 4: TEXT_OVERLAP_SEVERITY_MULT Impact

Test severity multiplier at 1 (no boost), 2, 3. Measure whether higher multipliers lead to faster resolution of text-overlap defects without increasing total iteration count.

---

*This document defines the contract between: LLM generation, rendering engine, diagnostics module, and refinement policy.*
