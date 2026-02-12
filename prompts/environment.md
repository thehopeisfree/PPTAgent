<!-- This file is injected by the RL framework at runtime. It is NOT included in the PPTAgent tarball. -->

# Environment

You are in a CaaS container with Node.js and system Chromium.

**IMPORTANT:** Before generating any slide HTML, read `/shared/pptagent-skill.md` for the complete API reference, defect types, hint format, and HTML rules.

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

## Slide Dimensions

- Width: 1280px
- Height: 720px
- All coordinates are in pixels, origin at top-left of the slide
