<!-- This file is injected by the RL framework at runtime. It is NOT included in the PPTAgent tarball. -->

# Environment

You are in a CaaS container with Node.js and system Chromium.

**Read `/shared/pptagent-skill.md` first** — it contains the workflow, constraints, IR schema, and routes to detailed guides for creating and fixing slides.

## PPTAgent

- Installed at `/tools/pptagent`
- CLI scripts: run from `/tools/pptagent` (e.g., `cd /tools/pptagent && npx tsx scripts/flatten.ts ...`)
- Browser: always use `launchBrowser()` — do NOT use `chromium.launch()` directly
- Slide size: 1280 × 720 px

## Output Paths

| Path | What |
|---|---|
| `/home/oai/share/answer.js` | Your generation script (Node.js ESM) — a record of your work |
| `/home/oai/share/answer.pptx` | Final slide output |
| Rollout dir | Specified in task instructions — save all intermediate artifacts there |
