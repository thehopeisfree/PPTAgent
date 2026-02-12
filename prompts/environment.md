<!-- This file is injected by the RL framework at runtime. It is NOT included in the PPTAgent tarball. -->

# Environment

You are in a CaaS container with Node.js and system Chromium.

## PPTAgent Location

PPTAgent is pre-installed at `/tools/pptagent`. Import from the compiled package:

```typescript
import {
  // Browser
  launchBrowser,          // Launches system Chromium (reads CHROMIUM_PATH)
  // Schema
  parseIR,                // Validate & parse IR JSON → IRDocument
  parsePatch,             // Parse patch document
  // Rendering
  renderHTML,             // IRDocument → full HTML string
  // DOM extraction (needs Playwright page)
  extractDOM,             // Load HTML into page + extract measurements
  screenshotSlide,        // Screenshot the #slide element → Buffer (PNG)
  // Diagnostics
  diagnose,               // Compare DOM vs IR → defects + hints
  // Patch
  applyPatch,             // Apply patch to IR → new IR + overrides
  // Flatten
  flattenHTML,            // Flexbox HTML → absolute-positioned HTML (needs page)
  // PPTX
  htmlToPptxFile,         // HTML → PPTX file
  // File utilities
  rolloutPaths,           // Compute artifact paths for a rollout iteration
  readJSON, writeJSON, writeFile,
} from '/tools/pptagent/dist/index.js';
```

## Browser Setup

Always use `launchBrowser()` — it uses the system Chromium with correct flags:

```typescript
const browser = await launchBrowser();
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

// ... do work ...

await browser.close();
```

Do NOT use `chromium.launch()` directly.

## Rollout Directory

Write all intermediate artifacts to `/home/oai/share/rollouts/<rollout_id>/`:

```typescript
const rolloutDir = '/home/oai/share/rollouts/rollout_001';
const paths = rolloutPaths(rolloutDir, 0);  // iter 0
// paths.ir    → /home/oai/share/rollouts/rollout_001/ir_0.json
// paths.html  → /home/oai/share/rollouts/rollout_001/out_0.html
// paths.render → /home/oai/share/rollouts/rollout_001/render_0.png
// paths.dom   → /home/oai/share/rollouts/rollout_001/dom_0.json
// paths.diag  → /home/oai/share/rollouts/rollout_001/diag_0.json
// paths.patch → /home/oai/share/rollouts/rollout_001/patch_0.json
// paths.trace → /home/oai/share/rollouts/rollout_001/trace.jsonl
```

## Full Workflow (API)

```typescript
import {
  launchBrowser, parseIR, extractDOM, diagnose,
  screenshotSlide, flattenHTML,
  rolloutPaths, writeJSON, writeFile,
} from '/tools/pptagent/dist/index.js';
import * as fs from 'node:fs';

// 1. Read IR input
const ir = parseIR(JSON.parse(fs.readFileSync('input.json', 'utf-8')));

// 2. Launch browser (reuse across iterations)
const browser = await launchBrowser();
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

// 3. Generate initial HTML (flexbox), then flatten to absolute
const flexboxHTML = '...';  // your generated HTML
const { html: absHTML } = await flattenHTML(page, flexboxHTML);

// 4. Save initial artifacts
const rolloutDir = '/home/oai/share/rollouts/rollout_001';
const p0 = rolloutPaths(rolloutDir, 0);
await writeFile(p0.html, absHTML);

// 5. Extract DOM + diagnose
const dom = await extractDOM(page, absHTML);
await writeJSON(p0.dom, dom);
const png = await screenshotSlide(page);
await writeFile(p0.render, png);
const diag = diagnose(dom, ir);
await writeJSON(p0.diag, diag);

// 6. Check results
if (diag.summary.defect_count === 0) {
  console.log('Clean!');
} else {
  // Read defects + hints, edit the HTML, re-run from step 5
  for (const d of diag.defects) {
    console.log(`[${d.type}] ${d.eid ?? d.owner_eid} — hint:`, d.hint);
  }
}

await browser.close();
```

## Slide Dimensions

- Width: 1280px
- Height: 720px
- All coordinates are in pixels, origin at top-left of the slide
