<!-- This file is injected by the RL framework at runtime. It is NOT included in the PPTAgent tarball. -->

# Implementation

## Task

Given a slide description, produce two files:
1. **`/home/oai/share/answer.js`** — Node.js ESM script that generates the slide
2. **`/home/oai/share/answer.pptx`** — the final 1280×720 slide

You work interactively: write code, run commands, inspect results, fix issues, repeat.

## Workflow

### 1. Design the layout

Read the slide description. Decide what elements to include (title, text, bullets, images, decorations) and their approximate positions. If an IR input (`input.json`) is provided, use it. Otherwise, design your own.

### 2. Write initial HTML (flexbox)

Write HTML with `data-eid` on every element inside `<div id="slide">`. You may use flexbox for the initial version — it's easier to get a reasonable layout.

### 3. Flatten to absolute positioning

```bash
cd /tools/pptagent && npx tsx scripts/flatten.ts /path/to/slide.html /path/to/abs.html
```

### 4. Validate

```bash
cd /tools/pptagent && npx tsx scripts/check-slide.ts /path/to/abs.html /path/to/input.json
```

- Exit 0 → clean, proceed to step 6
- Exit 1 → defects found, read the JSON output for hints

### 5. Fix defects and re-validate

Read the diagnostic hints. Each hint tells you the exact CSS value to set (absolute, not delta). Edit the HTML, then go back to step 4. See SKILL.md for defect types and hint format.

### 6. Convert to PPTX

```bash
cd /tools/pptagent && npx tsx scripts/to-pptx.ts /path/to/final.html /home/oai/share/answer.pptx
```

### 7. Save answer.js

Write `/home/oai/share/answer.js` — a self-contained script that captures your generation logic. It should import from `/tools/pptagent/dist/index.js` and reproduce the slide.

### 8. Save rollout artifacts

Use `rolloutPaths(rolloutDir, iter)` to save intermediate files (IR, HTML, DOM, diagnostics, screenshots) at each iteration. Archive if required by task instructions.
