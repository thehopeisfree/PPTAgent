# PPTAgent — Slide Layout Self-Refinement System

An automated layout correction toolkit for single-slide presentations. An LLM generates layout patches, Playwright renders and measures, a diagnostics engine detects spatial defects with calculated math hints, and the system iterates until the layout is correct — typically in 1-3 steps.

**Core idea:** LLMs are bad at pixel arithmetic but good at spatial reasoning over structured feedback. This system does the math, the model makes the decisions.

```
LLM ──JSON Patch──→ IR ──HTML──→ Playwright Render
 ↑                                      ↓
 └── Defects + Hints ←── Diagnostics ←── DOM Extraction (Range API)
```

---

## Table of Contents

- [Design Philosophy](#design-philosophy)
- [Architecture](#architecture)
- [Core Computation Logic](#core-computation-logic)
- [RL Container Integration](#rl-container-integration)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Constants Reference](#constants-reference)
- [Extending the System](#extending-the-system)

---

## Design Philosophy

### The Doctor Analogy

This system is structured like medical diagnostics: the tools (overlap detector, overflow detector, OOB detector) are the blood tests, X-rays, and MRIs — they produce objective, reproducible measurements. The LLM is the doctor: it reads the results, understands the global picture, and prescribes treatment.

You wouldn't ask a doctor to run their own MRI. Equally, you don't ask an LLM to compute the intersection area of two rectangles — it will get it wrong. But you *can* show it "element A and B overlap by 1840px², here are 4 ways to separate them, cheapest is moving A down 32px" and let it decide whether that's the right move given everything else on the slide.

### What the Model Actually Learns

The system separates **mechanical correctness** (handled by heuristics) from **strategic choice** (handled by the model):

| Layer | Who | What |
|---|---|---|
| Hard constraints | Heuristics | Budget clamping, aspect ratio, bounds clamping, min font — mechanically enforced, no learning needed |
| Diagnostics | Deterministic detectors | Overlap area, overflow pixels, OOB edges — precise measurements, not approximations |
| Strategy | The model | Multi-defect coordination, degradation trade-offs, multi-step planning |
| Quality gate | Grader | Final backstop, not part of the loop |

The model's unique contribution is **global coordination** across competing defects. When 5 elements are fighting for space, the diagnostics tell you each pairwise conflict independently, but the model must decide: which element moves, in which direction, by how much, and in what order across iterations.

### Why Iteration Beats One-Shot

Cascading conflicts can't be solved in one pass because:

1. Fixing A-B overlap pushes A into C's space — the new conflict only appears after re-rendering
2. Text `contentBox` depends on font shaping and line breaking — not predictable from arithmetic alone
3. Budget constraints cap per-step changes, so large corrections require multiple steps

Each iteration uses **Playwright as an oracle** — real DOM measurement after real rendering. The model learns a **reactive policy** ("given these diagnostics, what patch to emit"), not a planning-from-scratch strategy.

### Why Priority is Fixed

Priority encodes the slide author's intent: "the title must be prominent, the background can be sacrificed." This is input specification, not something the layout fixer should override. If priorities are wrong, that's a problem for the upstream IR generation model, not for the refinement loop.

Making priority dynamic would create feedback instability — lowering priority in one iteration loosens the budget for the next, which could cause oscillation.

---

## Architecture

### The Five Modules

```
┌─────────────────────────────────────────────────────────────────┐
│                        Loop Driver                               │
│  createSession → initRollout → [stepRollout × N] → StepResult   │
│                                                                  │
│  Convergence: success | stall (rollback) | max_iter (fallback)   │
│  Anti-repeat: patch fingerprinting → taboo set                   │
└──────┬─────────────────┬──────────────────┬─────────────────────┘
       │                 │                  │
       ▼                 ▼                  ▼
  ┌─────────┐     ┌────────────┐     ┌──────────────┐
  │  Patch   │     │  Renderer  │     │  Diagnostics │
  │  Apply   │     │  (HTML)    │     │   Engine     │
  │          │     │            │     │              │
  │ Budget   │     │ IR → HTML  │     │ 5 detectors  │
  │ Clamp    │     │ data-eid   │     │ + hints      │
  │ Ratio    │     │ positioning│     │ + conflict   │
  │ Enforce  │     │            │     │   graph      │
  └─────────┘     └─────┬──────┘     └──────▲───────┘
                        │                    │
                        ▼                    │
                  ┌───────────┐              │
                  │ Playwright │              │
                  │ DOM Extract│──────────────┘
                  │            │
                  │ Range API  │
                  │ Slide-local│
                  └────────────┘
```

**1. IR Schema** (`src/schema/ir.ts`) — Each slide element: `eid`, `type`, `priority` (0-100), `content`, `layout` (x, y, w, h, zIndex), `style` (fontSize, lineHeight, ...). All coordinates slide-local on a 1280x720 canvas. Element types: `title`, `bullets`, `image`, `text`, `decoration`. Validated with Zod.

**2. HTML Renderer** (`src/renderer/html-renderer.ts`) — Converts IR to standalone HTML. Each element becomes an absolutely-positioned `<div>` with `data-eid`. Bullets render as `<ul><li>`, images as `<img>`. Overflow set to `visible` so content measurement is accurate.

**3. DOM Extraction** (`src/extraction/dom-extractor.ts`) — Playwright evaluates a script in the browser context. For each `[data-eid]` element, extracts `bbox` (via `getBoundingClientRect`), `contentBox` (via Range API `getClientRects()` union — NOT `scrollHeight`), and computed styles. All coordinates are slide-local (subtracting the `#slide` container offset). `safeBox` = bbox inflated by `SAFE_PADDING` (8px) per side.

**4. Diagnostics Engine** (`src/diagnostics/engine.ts`) — Runs 5 detectors in fix-priority order, validates all hints, builds conflict graph:

| Detector | Trigger | Severity |
|---|---|---|
| `layout_topology` | Title center-y below body center-y | 5000 (fixed) |
| `font_too_small` | fontSize below priority tier minimum | (min - current) x 10 |
| `content_overflow` | contentBox exceeds bbox | overflow_x + overflow_y px |
| `out_of_bounds` | Element exceeds slide bounds | by_px per edge |
| `overlap` | SafeBox intersection >= 100px², same zIndex | area x 2 if text involved |

Plus `occlusion_suspected` warnings for cross-zIndex overlaps (informational only, doesn't count as defect).

**5. Patch Apply** (`src/patch/apply-patch.ts`) — Shallow-merges patch into IR with enforcement:
- **Dual budget** on priority >= 80: size props (w, h, fontSize, lineHeight) capped at 15% change; position props (x, y) capped at 48px
- **Image aspect ratio**: auto-adjusts the other dimension when w or h is patched alone; corrects distortion when both are patched beyond 1% tolerance
- **Min font floor**: fontSize never drops below priority tier minimum
- **Slide bounds clamp**: final layout clamped to [0, 1280] x [0, 720]

All enforcement is logged as `Override` records in the trace.

**6. Loop Driver** (`src/driver/loop-driver.ts`) — Session-based refinement loop:
- **Stop on success**: `defect_count == 0`
- **Stop on stall**: 2 consecutive non-improving iterations (both defect_count and severity) -> rollback to best prior IR
- **Stop on max iterations** (3): apply hard fallback (truncate, optionally hide lowest-priority element)
- **Anti-repeat memory**: non-improving patches fingerprinted -> taboo set; `checkPatch()` rejects repeated strategies
- **Quality labels**: `success_clean` | `success_with_warnings` | `degraded`

### Data Flow Per Iteration

```
rollouts/rollout_XXXX/
├── ir_0.json        <- Initial IR
├── out_0.html       <- Rendered HTML
├── render_0.png     <- Screenshot
├── dom_0.json       <- Extracted measurements
├── diag_0.json      <- Defects + hints + conflict graph
│
├── patch_1.json     <- LLM-generated patch
├── ir_1.json        <- Patched IR (after budget clamping)
├── out_1.html
├── render_1.png
├── dom_1.json
├── diag_1.json
│
├── ...              <- Repeats up to MAX_ITER
└── trace.jsonl      <- One JSON line per iteration (convergence metrics)
```

---

## Core Computation Logic

### Overlap Detection

For each element pair (A, B) where neither is `decoration`:

1. Inflate both bbox by `SAFE_PADDING` -> safeBox
2. Compute intersection area of safeBoxes
3. If area < `MIN_OVERLAP_AREA_PX` (100): skip (avoids jitter loops)
4. If same zIndex -> `overlap` defect
   - `owner_eid` = lower priority (default fix candidate)
   - `other_eid` = higher priority (context)
   - severity = area x `TEXT_OVERLAP_SEVERITY_MULT` if text involved
5. If different zIndex -> `occlusion_suspected` warning (informational)

### Content Overflow Detection

For each element:

1. Measure `contentBox` via Range API (union of `getClientRects()`)
2. Compare to bbox
3. If `contentBox.h > bbox.h` or `contentBox.w > bbox.w`:
   - `content_overflow` defect
   - hint: resize to `contentBox` + `HINT_BUFFER_PX`

Why Range API and not `scrollHeight`: `scrollHeight` reports phantom overflow when `line-height` is large. A container with 3 lines of text at `line-height: 2.0` will show `scrollHeight > clientHeight` even when all text is visually within bounds. The Range API measures actual ink bounds.

### Conflict Graph

When overlaps form chains (A overlaps B, B overlaps C), the engine:

1. Builds an adjacency graph from overlap defects
2. BFS to find connected components
3. For each pair, computes 4 separation options (up/down/left/right) with cost in px
4. Computes space envelopes: free pixels to nearest obstacle in each direction

This gives the LLM full spatial context without making decisions for it.

### Hint System

Every defect includes a pre-computed, validated hint:

| Defect | Hint |
|---|---|
| `overlap` | Cheapest of 4 directional moves to clear the other element's safeBox |
| `content_overflow` | `suggested_h = contentBox.h + 8px` (or `suggested_w`) |
| `out_of_bounds` | `suggested_x/y` to pull within bounds, or `suggested_w/h` to shrink |
| `font_too_small` | `suggested_fontSize = tier minimum` |
| `layout_topology` | `suggested_y` to place title above body element |

Hints are computed against **target state**, not as deltas. Applying a hint and re-running diagnostics will not reproduce the same hint (idempotency guarantee). All hints are clamped to slide bounds and marked `validated: true`.

### Budget Enforcement

Two separate budgets for high-priority (>= 80) elements:

**Size properties** (w, h, fontSize, lineHeight) — ratio-based:
```
allowed range = [current x 0.85, current x 1.15]
```
Rationale: shrinking a 44px title by 7px is visually significant. Shrinking a 200px image by 7px is not. Ratio captures perceptual impact.

**Position properties** (x, y) — absolute-based:
```
allowed range = [current - 48px, current + 48px]
```
Rationale: a title at y=32 and one at y=400 should have equal freedom to move. Ratio budgets would freeze near-origin elements.

Across multiple iterations, cumulative change can exceed one step's budget, but each single step is bounded.

### Image Aspect Ratio Enforcement

When a patch modifies an image element's dimensions:

| Scenario | Action |
|---|---|
| Only `w` patched | Auto-adjust `h = w / original_ratio` |
| Only `h` patched | Auto-adjust `w = h x original_ratio` |
| Both patched, ratio deviation <= 1% | Accept as-is |
| Both patched, ratio deviation > 1% | Respect `w`, correct `h` |

Runs after budget clamping but before slide bounds clamping.

### Stall Detection & Rollback

```
After each iteration:
  if defect_count did not decrease AND total_severity did not decrease:
    stallCount++
    add patch fingerprint to taboo set
  else:
    stallCount = 0

  if stallCount >= 2:
    rollback to best prior IR (lowest severity, tie-break lowest defect_count)
    stop with quality = "degraded"
```

Both metrics must fail to improve — this prevents premature rollback when the model makes a strategic trade-off (e.g., temporarily increasing defect count to resolve a higher-severity issue).

### Patch Fingerprinting

Each patch edit generates direction signatures:
```
e_title:move:down | e_bullets:resize_h:shrink | e_image:font:decrease
```

Sorted, deduplicated, joined with `|`. Non-improving patches are added to a session-scoped taboo set. `checkPatch()` rejects repeated strategies before they're applied.

---

## RL Container Integration

In an RL training setup, PPTAgent runs inside the container as the **environment**. The model is the **agent**. The loop looks like this:

### Container Setup

```bash
npm install
npx playwright install chromium
```

### Per-Episode Loop

```typescript
import {
  parseIR,
  parsePatch,
  createSession,
  initRollout,
  stepRollout,
  checkPatch,
} from "pptagent";
import { chromium } from "playwright";

// 1. Launch browser (once per container, reuse across episodes)
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

// 2. Start episode
const ir = parseIR(inputJSON);  // from dataset
const session = createSession(page, `rollouts/rollout_${id}`);
const step0 = await initRollout(session, ir);

if (step0.stopped) {
  // Already clean — no defects
  return step0.metrics;
}

// 3. Refinement loop — model is the agent
let currentStep = step0;
while (!currentStep.stopped) {
  // Feed diagnostics to model, get patch back
  const patch = await callModel(currentStep.diag, currentStep.ir);
  const parsedPatch = parsePatch(patch);

  // Check taboo list
  const check = checkPatch(session, parsedPatch);
  if (!check.allowed) {
    // Tell model to try a different strategy
    const retry = await callModel(
      currentStep.diag, currentStep.ir, check.reason
    );
    currentStep = await stepRollout(session, parsePatch(retry));
  } else {
    currentStep = await stepRollout(session, parsedPatch);
  }
}

// 4. Episode done — extract reward signal
const { quality, metrics } = currentStep;
// quality: "success_clean" | "success_with_warnings" | "degraded"
// metrics.defect_count_per_iter:    [5, 2, 0]
// metrics.total_severity_per_iter:  [3400, 800, 0]
// metrics.iterations_to_converge:   2
// metrics.budget_overrides:         1
```

### Reward Design

The system provides multiple signals for reward shaping:

| Signal | Source | Usage |
|---|---|---|
| `quality` | Final label | Sparse terminal reward: clean > warnings > degraded |
| `defect_count` drop | Per-iteration | Dense step reward: proportional to defects resolved |
| `total_severity` drop | Per-iteration | Weighted step reward: accounts for defect importance |
| `iterations_to_converge` | Final metrics | Efficiency bonus: fewer steps = better |
| `budget_overrides` | Final metrics | Penalty: patches that require clamping (model should learn to respect budgets) |
| `taboo_fingerprints` | Final metrics | Penalty: repeated failed strategies |

### What the Model Sees (Observation Space)

At each step, the model receives:

1. **Current IR** — the full element definitions with layout and style
2. **Diagnostics** (`diag_k.json`) containing:
   - Defect list with type, severity, involved elements, and calculated hints
   - Warning list (cross-zIndex occlusion)
   - Conflict graph with separation options and space envelopes
   - Summary: defect_count, total_severity, warning_count

### What the Model Outputs (Action Space)

A JSON patch document:
```json
{
  "edits": [
    { "eid": "e_bullets", "layout": { "y": 120, "h": 570 } },
    { "eid": "e_image", "layout": { "w": 300 } },
    { "eid": "e_caption", "style": { "fontSize": 16 } }
  ]
}
```

The system enforces all constraints post-hoc — the model doesn't need to self-police budgets, aspect ratios, or bounds. It just needs to produce directionally correct patches.

### Scaling

- One browser instance per container, one page per episode
- `createSession()` is lightweight state initialization
- DOM extraction + diagnostics take ~50ms per iteration
- Typical episode: 1-3 iterations = 50-150ms of tool time (model inference dominates)

---

## Quick Start

### Install

```bash
npm install
npx playwright install chromium
```

### Run Tests

```bash
npm test                    # all tests (Vitest)
npx tsc --noEmit            # typecheck
npx vitest run tests/patch  # just patch tests
```

### Run Demos

```bash
npx tsx demo.ts             # basic: 5 elements, diagnostics only
npx tsx demo-complex.ts     # 8 elements, patch + convergence + debug viewer
npx tsx demo-dense.ts       # 14 elements, 3 iterations
npx tsx demo-layers.ts      # multi-zIndex, grouped elements
npx tsx demo-ratio.ts       # image aspect ratio enforcement
```

Each demo creates an output directory with IR, HTML, screenshots, DOM extractions, diagnostics, and (for multi-iteration demos) an interactive `debug.html` viewer.

### Build

```bash
npm run build    # compile to dist/
```

---

## Project Structure

```
src/
├── constants.ts                          # All tunable parameters
├── index.ts                              # Public API exports
│
├── schema/
│   ├── ir.ts                             # IR element schema (Zod validated)
│   ├── dom.ts                            # DOM extraction types
│   ├── diag.ts                           # Diagnostics & hint types
│   ├── patch.ts                          # Patch schema (Zod validated)
│   └── trace.ts                          # Trace & metrics types
│
├── renderer/
│   └── html-renderer.ts                  # IR -> standalone HTML
│
├── extraction/
│   └── dom-extractor.ts                  # Playwright -> DOMDocument
│
├── diagnostics/
│   ├── engine.ts                         # Orchestrator (runs all detectors)
│   ├── severity.ts                       # Total severity calculator
│   ├── detectors/
│   │   ├── layout-topology.ts            # Title-above-body structural check
│   │   ├── content-overflow.ts           # ContentBox vs bbox
│   │   ├── out-of-bounds.ts              # Slide bounds check
│   │   ├── overlap.ts                    # SafeBox intersection + occlusion
│   │   └── font-too-small.ts             # Priority tier font minimum
│   └── hints/
│       ├── hint-calculator.ts            # Hint validation & clamping
│       ├── separation-calculator.ts      # 4-directional move cost computation
│       └── conflict-solver.ts            # Connected components + space envelopes
│
├── patch/
│   └── apply-patch.ts                    # Merge + budget + ratio + bounds clamp
│
├── driver/
│   └── loop-driver.ts                    # Session, convergence, fallback, taboo
│
├── debug/
│   ├── visual-debug.ts                   # Interactive multi-iteration HTML viewer
│   └── overlay.ts                        # Live Playwright SVG overlay injection
│
└── utils/
    ├── geometry.ts                       # Rect operations (inflate, intersect, clamp, ...)
    └── fs-helpers.ts                     # File I/O for rollout directories

tests/                                    # Vitest tests mirroring src/ structure
demo*.ts                                  # Runnable demo scripts
```

---

## Constants Reference

| Constant | Default | Purpose |
|---|---|---|
| `SLIDE_W` / `SLIDE_H` | 1280 / 720 | Slide canvas dimensions (px) |
| `SAFE_PADDING` | 8 | SafeBox inflation per side (px) |
| `MIN_OVERLAP_AREA_PX` | 100 | Ignore overlaps below this area (px²) |
| `OOB_EPS_PX` | 1 | Out-of-bounds tolerance (px) |
| `HINT_BUFFER_PX` | 8 | Extra buffer in hint suggestions (px) |
| `MAX_ITER` | 3 | Maximum refinement iterations |
| `STALL_THRESHOLD` | 2 | Non-improving iters before rollback |
| `HIGH_PRIO_SIZE_BUDGET` | 0.15 | Max size ratio change per patch (priority >= 80) |
| `HIGH_PRIO_MOVE_PX` | 48 | Max position change per patch in px (priority >= 80) |
| `IMAGE_ASPECT_RATIO_EPS` | 0.01 | Tolerance for image ratio deviation (1%) |
| `ALLOW_HIDE` | false | Whether fallback can hide elements |
| `TEXT_OVERLAP_SEVERITY_MULT` | 2 | Severity multiplier for text overlaps |
| `TOPOLOGY_SEVERITY` | 5000 | Fixed severity for structural violations |
| `MIN_FONT_BY_PRIORITY` | 100->32, 80->20, 60->16 | Minimum fontSize per priority tier |

---

## Extending the System

### Adding a New Detector

1. Create `src/diagnostics/detectors/my-detector.ts` exporting a detection function
2. Define the defect type in `src/schema/diag.ts`
3. Wire it into `src/diagnostics/engine.ts` at the appropriate position in the fix-priority order
4. Add tests in `tests/diagnostics/`

### Tuning Hint Richness (Difficulty Knob for RL)

The current system provides very rich hints — exact target values, pre-validated. To make the model learn more spatial reasoning:

- **Reduce hint detail**: report "overlap exists, area = 1840px²" without `suggested_y`. Force the model to compute moves itself.
- **Remove conflict graph**: only report pairwise defects, no connected components or envelopes.
- **Minimal mode**: defect type + severity only — no hints at all.

This acts as a curriculum: start with full hints for supervised warm-up, then progressively reduce as the model improves.

### Multi-Slide Support

The current system is single-slide. To extend:

- IR gains a `slides[]` array
- Each slide runs an independent refinement loop
- Cross-slide concerns (consistent font sizes, shared color palette) would need a post-loop global pass

### Element Add/Remove/Split

Currently out of scope — the element set is fixed per rollout. To support dynamic elements:

- Extend patch format with `add` / `remove` / `split` actions
- Update diagnostics to handle varying element counts across iterations
- Convergence tracking would need normalization (defect count isn't comparable across different element sets)

### Hierarchical Groups

The IR supports a `group` field for same-group exemptions (e.g., text-on-badge skips internal overlap checks). A future evolution path is full hierarchical groups with local coordinate systems:

```json
{
  "eid": "g_card_001",
  "type": "group",
  "layout": { "x": 100, "y": 200 },
  "children": ["e_card_title", "e_card_icon"]
}
```

Children use coordinates relative to the group. Moving a group moves all children. This reduces patch complexity for the LLM when dealing with complex multi-card layouts.
