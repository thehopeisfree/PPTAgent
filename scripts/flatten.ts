/**
 * CLI: Flatten flexbox HTML to absolute-positioned HTML.
 *
 * Usage:
 *   npx tsx scripts/flatten.ts <input.html> <output.html>
 *   npx tsx scripts/flatten.ts <input.html> --outdir <dir> --iter <n>
 *
 * When --outdir is used, writes to <outdir>/out_<iter>.html automatically.
 *
 * Exit codes:
 *   0 = success
 *   2 = error
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { flattenHTML } from "../src/flatten/flatten-html.js";
import { launchBrowser } from "../src/utils/browser.js";
import { rolloutPaths } from "../src/utils/fs-helpers.js";

const args = process.argv.slice(2);
const positional: string[] = [];
let outdir: string | undefined;
let iter = 0;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--outdir" && args[i + 1]) {
    outdir = args[++i];
  } else if (args[i] === "--iter" && args[i + 1]) {
    iter = parseInt(args[++i], 10);
  } else {
    positional.push(args[i]);
  }
}

const inputPath = positional[0];
if (!inputPath) {
  console.error(
    "Usage: npx tsx scripts/flatten.ts <input.html> [output.html]\n" +
    "       npx tsx scripts/flatten.ts <input.html> --outdir <dir> --iter <n>"
  );
  process.exit(2);
}

const outputPath = outdir
  ? rolloutPaths(outdir, iter).html
  : positional[1];

if (!outputPath) {
  console.error("Error: specify output path or --outdir");
  process.exit(2);
}

async function main() {
  let html: string;
  try {
    html = readFileSync(resolve(inputPath!), "utf-8");
  } catch {
    console.error(`Error: cannot read ${inputPath}`);
    process.exit(2);
  }

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    const result = await flattenHTML(page, html!);
    writeFileSync(resolve(outputPath!), result.html, "utf-8");
    console.log(
      `Flattened ${result.elements.length} elements → ${outputPath}`
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(2);
});
