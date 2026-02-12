/**
 * E2E test: simulates the full agent workflow using ONLY the tarball CLI.
 *
 * 1. Build tarball (pack.sh)
 * 2. Extract to temp dir, symlink node_modules
 * 3. Agent writes slide.html (with intentional defects + gradient decoration)
 * 4. Flatten → abs.html
 * 5. Diagnostics loop: check-slide → parse JSON → apply hints → repeat
 * 6. Convert to PPTX
 *
 * Catches: broken tarball packaging, missing CLI files, hint cycles,
 * gradient decoration misclassification, convergence regressions.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const ROOT = path.resolve(__dirname, "../..");
const TARBALL = path.join(ROOT, "pptagent.tar.gz");

/** Convert Windows backslash paths to forward slashes (for tar/bash). */
function slash(p: string): string {
  return p.replace(/\\/g, "/");
}

describe("CLI workflow e2e (tarball)", () => {
  let workDir: string;
  let toolDir: string;
  let shareDir: string;

  beforeAll(() => {
    // Build tarball
    execSync("bash scripts/pack.sh", { cwd: ROOT, stdio: "pipe", timeout: 60000 });

    // Extract to temp dir (simulates container /tools/pptagent)
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pptagent-e2e-"));
    toolDir = path.join(workDir, "pptagent");
    shareDir = path.join(workDir, "share");
    fs.mkdirSync(toolDir, { recursive: true });
    fs.mkdirSync(shareDir, { recursive: true });

    // Copy tarball locally to avoid tar interpreting C: as remote host
    const localTar = path.join(toolDir, "pptagent.tar.gz");
    fs.copyFileSync(TARBALL, localTar);
    execSync("tar xzf pptagent.tar.gz", { cwd: toolDir });
    fs.unlinkSync(localTar);

    // Symlink node_modules from repo (avoids npm install)
    fs.symlinkSync(
      path.join(ROOT, "node_modules"),
      path.join(toolDir, "node_modules"),
      "junction",
    );
  });

  afterAll(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  /** Run a CLI command from toolDir. Returns stdout and exit code. */
  function cli(cmd: string): { stdout: string; stderr: string; exitCode: number } {
    try {
      const stdout = execSync(cmd, {
        cwd: toolDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30000,
      });
      return { stdout, stderr: "", exitCode: 0 };
    } catch (err: any) {
      return {
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? "",
        exitCode: err.status ?? 1,
      };
    }
  }

  /**
   * Apply a diagnostics hint to an element's inline style in abs.html.
   * Finds the opening tag with data-eid="<eid>" and replaces CSS property values.
   */
  function applyHint(html: string, eid: string, hint: Record<string, any>): string {
    const eidMarker = `data-eid="${eid}"`;
    const eidIdx = html.indexOf(eidMarker);
    if (eidIdx === -1) return html;

    const tagStart = html.lastIndexOf("<", eidIdx);
    const tagEnd = html.indexOf(">", eidIdx);
    if (tagStart === -1 || tagEnd === -1) return html;

    let tag = html.slice(tagStart, tagEnd + 1);

    const mapping: [string, string][] = [
      ["suggested_x", "left"],
      ["suggested_y", "top"],
      ["suggested_w", "width"],
      ["suggested_h", "height"],
      ["suggested_fontSize", "font-size"],
    ];

    for (const [hintKey, cssProp] of mapping) {
      if (hint[hintKey] == null) continue;
      const value = Math.round(hint[hintKey] as number);
      const regex = new RegExp(`${cssProp}:\\s*[\\d.]+px`);
      if (regex.test(tag)) {
        tag = tag.replace(regex, `${cssProp}: ${value}px`);
      }
    }

    return html.slice(0, tagStart) + tag + html.slice(tagEnd + 1);
  }

  // ── Test 1: tarball package.json has no importable entry points ──

  it("tarball package.json has no main/exports", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(toolDir, "package.json"), "utf-8"),
    );
    expect(pkg.main).toBeUndefined();
    expect(pkg.exports).toBeUndefined();
    expect(pkg.types).toBeUndefined();
    expect(pkg.devDependencies).toBeUndefined();
    expect(pkg.scripts).toBeUndefined();
    expect(pkg.dependencies.playwright).toBeDefined();
    expect(pkg.dependencies.pptxgenjs).toBeDefined();
  });

  // ── Test 2: tarball contains exactly the expected files ──

  it("tarball contains bin/ scripts and docs, no dist/ or src/", () => {
    const expected = [
      "bin/check-slide.js",
      "bin/flatten.js",
      "bin/replay.js",
      "bin/to-pptx.js",
      "bin/verify-setup.js",
      "package.json",
      "package-lock.json",
      "SKILL.md",
      "creating.md",
      "fixing.md",
      "scripts/container-setup.sh",
    ];
    for (const f of expected) {
      expect(fs.existsSync(path.join(toolDir, f)), `missing: ${f}`).toBe(true);
    }

    // Must NOT contain dist/ or src/
    expect(fs.existsSync(path.join(toolDir, "dist"))).toBe(false);
    expect(fs.existsSync(path.join(toolDir, "src"))).toBe(false);
  });

  // ── Test 3: full agent workflow with gradient decoration ──

  it("agent workflow: gradient bg → flatten → diagnose loop → pptx", () => {
    const slideHtml = path.join(shareDir, "slide.html");
    const absHtml = path.join(shareDir, "abs.html");
    const rolloutDir = path.join(shareDir, "rollout");
    const pptxPath = path.join(shareDir, "answer.pptx");

    fs.mkdirSync(rolloutDir, { recursive: true });

    // ── Step 1: Agent writes slide HTML ──
    // Intentional defects:
    //   - e_bg has linear-gradient (must be inferred as decoration, not text)
    //   - e_title at x=5 → edge_proximity
    //   - e_body overlaps e_title → overlap
    //   - e_body fontSize 14px < 16px min → font_too_small
    fs.writeFileSync(
      slideHtml,
      `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  * { margin: 0; padding: 0; }
  body { background: #fff; }
  #slide {
    position: relative; width: 1280px; height: 720px; overflow: hidden;
    font-family: Arial, Helvetica, sans-serif;
    display: flex; flex-direction: column; padding: 40px;
  }
</style></head><body><div id="slide">
  <div data-eid="e_bg" style="position: absolute; left: 0; top: 0; width: 1280px; height: 720px; z-index: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);"></div>
  <div data-eid="e_title" style="font-size: 44px; font-weight: bold; color: white; z-index: 10; margin-bottom: 8px;">Quarterly Report</div>
  <div data-eid="e_body" style="font-size: 14px; color: white; z-index: 10; flex: 1;"><ul style="margin:0;padding-left:1.5em;list-style-type:disc"><li>Revenue up 23%</li><li>Margins improved to 18%</li><li>Customer retention at 94%</li></ul></div>
</div></body></html>`,
    );

    // ── Step 2: Flatten ──
    const flattenResult = cli(
      `node bin/flatten.js "${slash(slideHtml)}" "${slash(absHtml)}"`,
    );
    expect(flattenResult.exitCode).toBe(0);
    expect(fs.existsSync(absHtml)).toBe(true);

    // ── Step 3: Diagnostics loop ──
    const MAX_LOOP = 4;
    let converged = false;
    const defectHistory: number[] = [];

    for (let iter = 0; iter < MAX_LOOP; iter++) {
      const diagResult = cli(
        `node bin/check-slide.js "${slash(absHtml)}" --outdir "${slash(rolloutDir)}" --iter ${iter}`,
      );

      if (diagResult.exitCode === 0) {
        converged = true;
        defectHistory.push(0);
        break;
      }

      expect(diagResult.exitCode).toBe(1);

      // Parse diagnostics JSON from stdout
      const diag = JSON.parse(diagResult.stdout);
      const defectCount = diag.summary.defect_count as number;
      defectHistory.push(defectCount);

      // ── Verify gradient bg is decoration (no overlap defects involving e_bg) ──
      for (const d of diag.defects) {
        if (d.type === "overlap") {
          expect(d.owner_eid).not.toBe("e_bg");
          expect(d.other_eid).not.toBe("e_bg");
        }
      }

      // ── Apply hints to abs.html (simulates agent editing) ──
      let absContent = fs.readFileSync(absHtml, "utf-8");
      for (const defect of diag.defects) {
        if (!defect.hint) continue;
        const eid =
          defect.eid ?? defect.hint.target_eid ?? defect.owner_eid;
        if (!eid) continue;
        absContent = applyHint(absContent, eid, defect.hint);
      }
      fs.writeFileSync(absHtml, absContent);
    }

    // ── Assert convergence ──
    expect(converged).toBe(true);
    expect(defectHistory.length).toBeLessThanOrEqual(MAX_LOOP);

    // Defect count should be monotonically non-increasing (no hint cycles)
    for (let i = 1; i < defectHistory.length; i++) {
      expect(
        defectHistory[i],
        `defect count increased at iter ${i}: ${defectHistory.join(" → ")}`,
      ).toBeLessThanOrEqual(defectHistory[i - 1]!);
    }

    // ── Step 4: Convert to PPTX ──
    const pptxResult = cli(
      `node bin/to-pptx.js "${slash(absHtml)}" "${slash(pptxPath)}"`,
    );
    expect(pptxResult.exitCode).toBe(0);
    expect(fs.existsSync(pptxPath)).toBe(true);
    expect(fs.statSync(pptxPath).size).toBeGreaterThan(0);

    // ── Print convergence summary ──
    console.log(
      `  Converged in ${defectHistory.length} iterations: ${defectHistory.join(" → ")} defects`,
    );
  }, 60000);
});
