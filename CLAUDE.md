# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PPTAgent is a slide layout self-refinement system (codenamed "AGENTS v2.5"). An LLM generates layout patches for a single 1280×720 slide, Playwright renders the result, a diagnostics engine detects spatial defects with calculated math hints, and the LLM iterates until the layout is correct (typically 1–3 steps). The full design spec is in `DESIGN.md`.

## Architecture (Refinement Loop)

```
LLM ──JSON Patch──→ IR ──HTML──→ Playwright Render
 ↑                                      ↓
 └── Defects + Hints ←── Diagnostics ←── DOM Extraction
```

**Five modules, in implementation order:**

1. **IR Schema** — Each slide element has `eid`, `type`, `priority` (0–100), `content`, `layout` (`x, y, w, h, zIndex`), and `style` (`fontSize`, `lineHeight`, etc.). Decoration elements (`type: "decoration"`) are exempt from overlap checks. All coordinates are slide-local (origin at top-left of slide container).

2. **Playwright DOM Extraction** — For each `[data-eid]` element, extracts `bbox`, `safeBox` (bbox inflated by `SAFE_PADDING`), `contentBox` (union of `Range.getClientRects()` — do NOT use `scrollHeight`), `zIndex`, and computed styles. All values must be slide-local (subtract the slide container's viewport offset).

3. **Diagnostics Engine** — Detects four defect types (`content_overflow`, `out_of_bounds`, `overlap`, `font_too_small`) and one warning type (`occlusion_suspected` for cross-zIndex overlaps). Assigns `owner_eid` (lower-priority) vs `other_eid` (higher-priority) for pairwise defects. Builds conflict chains and pre-computes coordinated hints with tail bounds checks. Fix priority order: font → overflow → out_of_bounds → overlap.

4. **Patch Apply** — Shallow-merges `layout`/`style` from patch into IR. Enforces dual budget on priority ≥ 80 elements: size properties (w, h, fontSize, lineHeight) capped at 15% change per patch; position properties (x, y) capped at 48px per patch. Logs all clamping to trace `overrides`.

5. **Loop Driver** — Stops on: success (`defect_count == 0`), max iterations (`MAX_ITER=3`), or stall (2 consecutive non-improving iterations on both `defect_count` and `total_severity`). On stall, rolls back to the best prior IR. Hard fallbacks at max iterations: truncate (always), hide lowest-priority element (`ALLOW_HIDE` flag, default false), alert. Final quality is `success_clean`, `success_with_warnings`, or `degraded`.

## Key Constants

| Constant | Default | Purpose |
|---|---|---|
| `SLIDE_W` / `SLIDE_H` | 1280 / 720 | Slide dimensions |
| `SAFE_PADDING` | 8 | SafeBox inflation per side (px) |
| `MIN_OVERLAP_AREA_PX` | 100 | Minimum overlap area to report (px²) |
| `MAX_ITER` | 3 | Maximum refinement iterations |
| `STALL_THRESHOLD` | 2 | Consecutive non-improving iters before rollback |
| `HIGH_PRIO_SIZE_BUDGET` | 0.15 | Max ratio change per patch for size props (priority ≥ 80) |
| `HIGH_PRIO_MOVE_PX` | 48 | Max absolute move per patch for position props (priority ≥ 80) |
| `TEXT_OVERLAP_SEVERITY_MULT` | 2 | Severity multiplier when overlap involves text |

## File Structure Per Rollout

```
rollouts/rollout_XXXX/
├── input.json       # Original content input
├── ir_0.json        # Initial IR
├── out_0.html       # Rendered HTML
├── render_0.png     # Screenshot
├── dom_0.json       # DOM extraction
├── diag_0.json      # Diagnostics + hints
├── patch_1.json     # LLM patch
├── ir_1.json        # Patched IR
├── ...              # Repeats per iteration
└── trace.jsonl      # One JSON line per iteration with convergence metrics
```

## Important Design Decisions

- **Range API, not scrollHeight**: `scrollHeight` reports phantom overflow with large `line-height`. Use `Range.getClientRects()` union for `contentBox`.
- **Dual budget system**: Size properties use ratio-based budgets (15%); position properties use absolute budgets (48px). Rationale: perceptual impact of size changes scales with value, but position changes near origin would be frozen under ratio budgets.
- **Severity scoring**: Overlap severity is multiplied by `TEXT_OVERLAP_SEVERITY_MULT` (2×) when text elements are involved, because text occlusion destroys readability.
- **Warnings vs defects**: `occlusion_suspected` (cross-zIndex overlap) is a warning only — it doesn't count toward defect metrics or trigger stall detection, but does affect the final quality label.
- **Hint idempotency**: Validated hints are computed against target state, not as deltas. Applying a hint and re-running diagnostics must not reproduce the same hint.

## Build & Test Commands

- `npm test` — run all tests (Vitest, includes Playwright integration tests)
- `npx tsc --noEmit` — typecheck without emitting
- `npm run build` — compile TypeScript to `dist/`
- `npx vitest run tests/schema tests/utils tests/renderer tests/patch tests/diagnostics` — unit tests only (no Playwright)
- `npx playwright install chromium` — install browser for integration tests
