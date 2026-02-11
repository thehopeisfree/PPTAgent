/**
 * CLI: Convert an absolute-positioned HTML slide to PPTX.
 *
 * Usage:
 *   npx tsx scripts/to-pptx.ts <slide.html> <output.pptx>
 *
 * Exit codes:
 *   0 = success
 *   2 = error (missing args, file not found, conversion failure)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { htmlToPptxFile } from "../src/pptx/html-to-pptx.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Usage: npx tsx scripts/to-pptx.ts <slide.html> <output.pptx>"
    );
    process.exit(2);
  }

  const htmlPath = resolve(args[0]);
  const outputPath = resolve(args[1]);

  let html: string;
  try {
    html = readFileSync(htmlPath, "utf-8");
  } catch {
    console.error(`Error: cannot read ${htmlPath}`);
    process.exit(2);
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    await htmlToPptxFile(page, html, outputPath);
    console.log(`PPTX written to ${outputPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(2);
});
