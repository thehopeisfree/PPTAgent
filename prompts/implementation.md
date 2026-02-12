<!-- This file is injected by the RL framework at runtime. It is NOT included in the PPTAgent tarball. -->

# Implementation

## Task

Given a slide description, produce two files:
1. **`/home/oai/share/answer.js`** — Node.js ESM script that generates the slide using PPTAgent
2. **`/home/oai/share/answer.pptx`** — the final 1280×720 slide (produced by running answer.js)

⚠️ **answer.js must use PPTAgent's pipeline** (HTML → flatten → diagnose → fix → PPTX). Do NOT use pptxgenjs directly — the grader evaluates slides produced through PPTAgent's diagnostics-verified pipeline.

You work interactively: write code, run commands, inspect results, fix issues, repeat.

## Workflow

### 1. Read the skill docs

```bash
cat /shared/pptagent-skill.md
```

This is **mandatory** — it contains the HTML format, constraints, and routes to creating/fixing guides.

### 2. Design the layout

Read the slide description. Plan elements in structured markdown (see `/tools/pptagent/creating.md`). If an IR input (`input.json`) is provided, use it. Otherwise, design your own.

### 3. Write initial HTML (flexbox)

Write HTML with `data-eid` on every element inside `<div id="slide">`. Save as `/home/oai/share/slide.html`. You may use flexbox for the initial version — it's easier to get a reasonable layout.

### 4. Flatten to absolute positioning

```bash
cd /tools/pptagent && npx tsx scripts/flatten.ts /home/oai/share/slide.html /home/oai/share/abs.html
```

### 5. Validate

```bash
cd /tools/pptagent && npx tsx scripts/check-slide.ts /home/oai/share/abs.html --outdir <rolloutDir> --iter 0
```

- Exit 0 → clean, proceed to step 7
- Exit 1 → defects found, read the JSON output for hints
- `--outdir` and `--iter` automatically save DOM, diagnostics, and screenshot to the rollout directory
- Element types and priorities are auto-inferred from HTML (no input.json needed)

### 6. Fix defects and re-validate

Read the diagnostic hints. Each hint tells you the exact CSS value to set (absolute, not delta). Edit `/home/oai/share/abs.html`, then go back to step 5 (increment `--iter`). See `/tools/pptagent/fixing.md` for defect types and hint format.

### 7. Save final HTML

Save your final fixed HTML as `/home/oai/share/answer.html`.

### 8. Write answer.js

Write `/home/oai/share/answer.js` — reads the final HTML and converts to PPTX:

```javascript
import { htmlToPptxFile } from '/tools/pptagent/dist/index.js';
import fs from 'node:fs';

const html = fs.readFileSync('/home/oai/share/answer.html', 'utf-8');
await htmlToPptxFile(html, '/home/oai/share/answer.pptx');
```

Run it to produce the PPTX:

```bash
node /home/oai/share/answer.js
```

### 9. Visual QA

Render the PPTX to images and verify:

```bash
python /home/oai/share/render_slides.py /home/oai/share/answer.pptx
```

Check for overlaps, text overflow, alignment issues, and missing elements.

### 10. Save rollout artifacts

Save intermediate files (IR, HTML, DOM, diagnostics, screenshots) to the rollout directory specified in your task instructions. Archive if required.
