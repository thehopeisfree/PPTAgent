# Environment

You are in a container with Node.js, TypeScript (tsx), and Playwright (Chromium).

## Available Commands

### Flatten flexbox HTML to absolute positioning
```bash
npx tsx scripts/flatten.ts <input.html> <output.html>
```
- Renders flexbox/natural HTML in Playwright, extracts computed positions
- Produces equivalent HTML with all elements using `position: absolute`
- Use this after generating your initial flexbox HTML

### Validate a slide layout
```bash
npx tsx scripts/check-slide.ts <slide.html> <input.json> [screenshot.png]
```
- Reads your HTML slide and the IR input specification
- Renders via Playwright, extracts DOM measurements, runs diagnostics
- Prints diagnostics JSON to stdout
- Exit 0 = no defects (clean), exit 1 = has defects, exit 2 = error
- Optional 3rd argument: save a screenshot of the rendered slide

### Convert HTML to PPTX
```bash
npx tsx scripts/to-pptx.ts <slide.html> <output.pptx>
```
- Converts an absolute-positioned HTML slide to PowerPoint format
- Uses PptxGenJS: positions, colors, fonts are converted precisely
- Remote image URLs become placeholder shapes (use local paths or data URIs for real images)

### Run a TypeScript script
```bash
npx tsx <script.ts>
```

## Available Libraries

Import from `./src/index.js` (PPTAgent):
```typescript
import {
  // Schema parsing
  parseIR,              // Validate & parse IR JSON → IRDocument
  // DOM extraction (needs Playwright page)
  extractDOM,           // Load HTML into page + extract measurements
  screenshotSlide,      // Screenshot the #slide element
  // Diagnostics
  diagnose,             // Compare DOM vs IR → defects + hints
} from "./src/index.js";
```

Import from `playwright`:
```typescript
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });
```

## File Paths

- IR input: provided per task (JSON file)
- Your HTML output: write to the designated output path
- Screenshots: optional, for debugging

## Slide Dimensions

- Width: 1280px
- Height: 720px
- All coordinates are in pixels, origin at top-left of the slide
