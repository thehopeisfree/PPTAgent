# PPTAgent — Slide Layout Self-Refinement System

An automated layout correction toolkit for single-slide presentations. An LLM generates layout patches, Playwright renders and measures, a diagnostics engine detects spatial defects with calculated math hints, and the system iterates until the layout is correct — typically in 1-3 steps.

**Core idea:** LLMs are bad at pixel arithmetic but good at spatial reasoning over structured feedback. This system does the math, the model makes the decisions.

**Two-phase workflow:** The model writes HTML with flexbox layout (easy to get right). The system flattens it to absolute positioning (mechanical), then validates and iterates on the absolute-positioned HTML using diagnostic hints.

```
Description → HTML (flexbox) → Flatten → Absolute HTML → Playwright Render
                                              ↑                    ↓
                                         Fix CSS values    DOM Extraction
                                              ↑                    ↓
                                         Defects + Hints ←── Diagnostics
```

---

## Table of Contents

- [Design Philosophy](#design-philosophy)
- [Architecture](#architecture)
- [Core Computation Logic](#core-computation-logic)
- [Deployment](#deployment)
- [Programmatic API](#programmatic-api)
- [RL Training](#rl-training)
- [Quick Start](#quick-start)
- [CLI Scripts](#cli-scripts)
- [Project Structure](#project-structure)
- [Skill Docs](#skill-docs)
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

The model interacts with PPTAgent through CLI scripts. The internal pipeline:

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│ Flatten   │     │ DOM      │     │ Diagnostics  │
│           │     │ Extract  │     │   Engine     │
│ flexbox → │     │          │     │              │
│ absolute  │     │ Playwright│     │ 5 detectors  │
│           │     │ Range API │     │ + hints      │
│           │     │ slide-local│    │ + conflict   │
└──────────┘     └─────┬──────┘    └──────▲───────┘
                       │                   │
                       ▼                   │
                 ┌───────────┐             │
                 │ IR Infer  │─────────────┘
                 │ (auto)    │
                 └───────────┘

┌──────────┐     ┌──────────┐
│ PPTX     │     │ Patch    │
│ Convert  │     │ Apply    │
│           │     │          │
│ HTML →    │     │ budget   │
│ pptxgenjs │     │ clamp    │
└──────────┘     └──────────┘
```

**Flatten** (`src/flatten/flatten-html.ts`) — Converts flexbox/grid HTML to absolute-positioned HTML. Renders in Playwright, reads computed positions for each `[data-eid]` element, rewrites to `position: absolute` with `overflow: visible`. One-way transform.

**DOM Extraction** (`src/extraction/dom-extractor.ts`) — Playwright evaluates a script in the browser context. For each `[data-eid]` element, extracts `bbox` (via `getBoundingClientRect`), `contentBox` (via Range API `getClientRects()` union — NOT `scrollHeight`), and computed styles. All coordinates are slide-local. `safeBox` = bbox inflated by `SAFE_PADDING` (8px) per side.

**IR Inference** (`src/ir/infer-ir.ts`) — Auto-generates a minimal IR from rendered HTML when no `input.json` is provided. Infers `type` and `priority` from HTML structure:

| HTML pattern | Inferred type | Priority |
|---|---|---|
| Contains `<img>`, no text | `image` | 50 |
| Contains `<ul>`/`<ol>` | `bullets` | 60 |
| No text, has background (color/gradient/image) | `decoration` | 0 |
| Bold + font >= 28px | `title` | 100 |
| Everything else | `text` | 60 |

Diagnostics only reads `eid`, `type`, and `priority` from the IR — it uses DOM-extracted values for everything else.

**Diagnostics Engine** (`src/diagnostics/engine.ts`) — Runs 5 detectors in fix-priority order, validates all hints, builds conflict graph:

| Detector | Trigger | Severity |
|---|---|---|
| `layout_topology` | Title center-y below body center-y | 5000 (fixed) |
| `font_too_small` | fontSize below priority tier minimum | (min - current) x 10 |
| `content_overflow` | contentBox exceeds bbox | overflow_x + overflow_y px |
| `out_of_bounds` | Element exceeds slide bounds | by_px per edge |
| `overlap` | SafeBox intersection >= 100px², same zIndex | area x 2 if text involved |

Plus `occlusion_suspected` warnings for cross-zIndex overlaps (informational only).

**PPTX Conversion** (`src/pptx/html-to-pptx.ts`) — Renders HTML in Playwright, extracts bounding boxes/styles/text, builds PowerPoint via pptxgenjs. Accepts `(html, outputPath)` for standalone use or `(page, html, outputPath)` to reuse an existing browser.

**Patch Apply** (`src/patch/apply-patch.ts`) — Shallow-merges patch into IR with enforcement. Used by the programmatic API (see below), not the CLI workflow.

### Rollout Artifacts

Each validation iteration saves artifacts to the rollout directory:

```
<rolloutDir>/
├── out_0.html       <- Rendered HTML
├── render_0.png     <- Screenshot
├── dom_0.json       <- Extracted measurements
├── diag_0.json      <- Defects + hints + conflict graph
├── out_1.html       <- After fixing
├── ...
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
| `overlap` | Cheapest of 4 directional moves to clear the other element's safeBox, with edge-proximity awareness (auto-caps `suggested_w`/`suggested_h` if the move would breach `EDGE_MARGIN_PX`) |
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

---

## Deployment

### Package for Container

```bash
bash scripts/pack.sh                    # -> pptagent.tar.gz (~160K)
```

The tarball contains **only CLI entry points** — no `dist/`, no `src/`, no dev dependencies:

```
bin/                          # esbuild-bundled CLI scripts (self-contained)
package.json                  # stripped: runtime deps only, no main/exports
package-lock.json             # lockfile for reproducible installs
SKILL.md, creating.md, fixing.md  # model context docs
scripts/container-setup.sh    # container bootstrap
```

The `package.json` in the tarball is intentionally stripped of `main`, `types`, and `exports` fields so that LLM agents cannot discover or import internal modules — they can only interact through the `bin/` CLI scripts.

### Container Bootstrap

```bash
tar xzf pptagent.tar.gz -C /tools/pptagent
bash /tools/pptagent/scripts/container-setup.sh
```

`container-setup.sh` handles: npm install, Chromium setup (prefers system Chromium via `CHROMIUM_PATH`, falls back to Playwright install), font installation, and copies `SKILL.md` to `/shared/pptagent-skill.md`.

**Environment variables** (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `PPTAGENT_ROOT` | Parent of `scripts/` | Installation directory |
| `SHARED_DIR` | `/shared` | Where to copy skill docs |
| `CHROMIUM_PATH` | Auto-detected | Path to system Chromium binary |
| `SKIP_FONTS` | `0` | Set `1` to skip font installation |
| `SKIP_VERIFY` | `0` | Set `1` to skip smoke test |

---

## Programmatic API

For frameworks that want to drive the refinement loop programmatically (e.g., RL training), the core modules are also available as a Node.js library:

```typescript
import {
  parseIR, parsePatch, createSession,
  initRollout, stepRollout, launchBrowser,
} from "pptagent";

const browser = await launchBrowser();
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

const ir = parseIR(inputJSON);
const session = createSession(page, `rollouts/rollout_${id}`);
const step0 = await initRollout(session, ir);

let currentStep = step0;
while (!currentStep.stopped) {
  const patch = await callModel(currentStep.diag, currentStep.ir);
  currentStep = await stepRollout(session, parsePatch(patch));
}

const { quality, metrics } = currentStep;
// quality: "success_clean" | "success_with_warnings" | "degraded"
```

The loop driver handles stall detection, rollback to best prior state, patch fingerprinting (taboo set for repeated strategies), and budget enforcement. See `src/driver/loop-driver.ts` for details.

---

## RL Training

PPTAgent's diagnostics engine is a deterministic, verifiable reward function — making it a natural fit for Reinforcement Learning with Verifiable Rewards (RLVR) and agentic RL training.

### PPTAgent as an RL Environment

| RL Concept | PPTAgent Mapping |
|---|---|
| **State** | `abs.html` (current slide layout) |
| **Action** | CSS edits to the HTML (applying hints) |
| **Environment** | Playwright render + diagnostics engine |
| **Reward** | `defect_count`, `total_severity` (exact numerical) |
| **Episode** | One rollout (`trace.jsonl` records the full trajectory) |
| **Termination** | `exit 0` = success, stall = rollback |

### Why This is Better Than Typical RLVR

Standard RLVR (e.g., math problems) provides a binary terminal reward: answer correct or not. PPTAgent provides:

- **Dense intermediate rewards** — every iteration returns `defect_count` and `total_severity`, not just the final result
- **Decomposable signals** — 7 defect types with independent severity scores, enabling fine-grained credit assignment
- **Structured hints** — pre-computed fix suggestions that serve as reward shaping, guiding the agent toward the solution
- **Deterministic verification** — same input always produces same diagnostics, no stochastic reward noise

### Two-Level Optimization

```
Outer loop (training-time RLVR)
│  Sample diverse slide descriptions as prompts
│  Run rollout episodes through CLI
│  Reward = f(convergence speed, final severity, budget overrides)
│  Update LLM weights via GRPO/PPO
│
└── Inner loop (inference-time ICRL)     ← current system
    │  LLM reads diagnostics JSON (observation)
    │  Generates HTML edits (action)
    │  Diagnostics returns new defects (reward)
    │  Repeats 1-3 iterations
```

The **inner loop** (what PPTAgent does today) is in-context self-refinement at inference time. An **outer loop** can use rollout trajectories as training data to improve the base model's layout generation skills via RLVR.

### Reward Design

The `trace.jsonl` already captures per-iteration metrics. A reward function could combine:

```
reward = -total_severity                     # primary signal
       + bonus_for_early_convergence         # fewer iterations = better
       + penalty_for_budget_clamping         # overrides indicate crude edits
       + penalty_for_taboo_hits              # repeated failed strategies
```

### Integration Points

- **CLI as environment interface** — the tarball's `bin/check-slide.js` (exit code + JSON stdout) can be called from any RL framework (Python, Node, shell) without code coupling
- **Programmatic API for tighter loops** — `createSession` / `initRollout` / `stepRollout` provide in-process control for frameworks like Agent Lightning that need per-step access
- **Rollout artifacts** — `trace.jsonl` contains `(iter, defect_count, total_severity, action)` tuples, directly usable as RLVR trajectories

---

## Quick Start

### Install

```bash
npm install
npx playwright install chromium
```

### Run Tests

```bash
npm test                    # all tests (212 tests, ~13s)
npx tsc --noEmit            # typecheck
npx vitest run tests/patch  # just patch tests
npx vitest run tests/e2e    # e2e: tarball → CLI workflow → convergence
```

The **e2e test** (`tests/e2e/cli-workflow.test.ts`) simulates the full agent workflow: builds tarball, extracts to temp dir, writes HTML with intentional defects (including gradient decoration), runs the complete `flatten → check-slide loop → to-pptx` pipeline using only CLI commands, and verifies convergence with no hint cycles.

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

## CLI Scripts

All scripts run from the repo root via `npx tsx scripts/<name>.ts`.

| Script | Usage | Description |
|---|---|---|
| `flatten.ts` | `npx tsx scripts/flatten.ts <input.html> <output.html>` | Convert flexbox HTML to absolute positioning |
| `check-slide.ts` | `npx tsx scripts/check-slide.ts <slide.html> [input.json] --outdir <dir> --iter <n>` | Validate layout, output diagnostics JSON. `input.json` optional — auto-infers IR from HTML. Exit 0 = clean, 1 = defects |
| `to-pptx.ts` | `npx tsx scripts/to-pptx.ts <slide.html> <output.pptx>` | Convert absolute HTML to PowerPoint |
| `replay.ts` | `npx tsx scripts/replay.ts <rollout-dir> [output.html]` | Generate interactive debug viewer from rollout artifacts |
| `pack.sh` | `bash scripts/pack.sh [output-path]` | Build and package tarball for container deployment |
| `container-setup.sh` | `bash scripts/container-setup.sh` | Bootstrap PPTAgent in a container (npm, Chromium, fonts) |

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
├── ir/
│   └── infer-ir.ts                       # Auto-infer IR from rendered HTML
│
├── flatten/
│   └── flatten-html.ts                   # Flexbox -> absolute positioning
│
├── pptx/
│   └── html-to-pptx.ts                  # HTML -> PowerPoint via pptxgenjs
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
│   ├── synthetic-ir.ts                   # Build IR from DOM + optional metadata
│   └── overlay.ts                        # Live Playwright SVG overlay injection
│
└── utils/
    ├── geometry.ts                       # Rect operations (inflate, intersect, clamp, ...)
    ├── browser.ts                        # launchBrowser() with CHROMIUM_PATH support
    └── fs-helpers.ts                     # File I/O for rollout directories

scripts/                                  # CLI tools (flatten, check-slide, to-pptx, etc.)
tests/
├── e2e/
│   └── cli-workflow.test.ts              # Full tarball CLI workflow: flatten → diagnose → pptx
├── diagnostics/                          # Unit tests for each detector
├── ...                                   # Mirrors src/ structure
SKILL.md                                  # Skill router (progressive disclosure)
creating.md                               # Phase 1: flexbox HTML creation guide
fixing.md                                 # Phase 2: defect fixing guide
```

---

## Skill Docs

Three markdown files guide an LLM through slide creation, following a [progressive disclosure](https://github.com/anthropics/skills/tree/main/skills/pptx) pattern:

| File | Purpose |
|---|---|
| `SKILL.md` | Router — workflow overview, constraints table, CLI commands. Entry point. |
| `creating.md` | Phase 1 — plan layout in markdown, write flexbox HTML, flatten to absolute. |
| `fixing.md` | Phase 2 — run diagnostics, read hints, fix CSS values, re-validate. |

These are included in the deployment tarball. `container-setup.sh` copies `SKILL.md` to `/shared/pptagent-skill.md` where the framework prompt references it.

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

### Tuning Hint Richness

The current system provides very rich hints — exact target values, pre-validated. To increase difficulty:

- **Reduce hint detail**: report "overlap exists, area = 1840px²" without `suggested_y`. Force the model to compute moves itself.
- **Remove conflict graph**: only report pairwise defects, no connected components or envelopes.
- **Minimal mode**: defect type + severity only — no hints at all.

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
