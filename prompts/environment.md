<!-- This file is injected by the RL framework at runtime. It is NOT included in the PPTAgent tarball. -->

# Environment

You are in a CaaS container with Node.js and system Chromium.

⚠️ **You MUST use PPTAgent for all slide generation.** Read `/shared/pptagent-skill.md` first — it contains the workflow, constraints, IR schema, and routes to detailed guides. Do NOT use pptxgenjs directly or any other slide generation method. All slides must go through PPTAgent's HTML → flatten → diagnose → fix → PPTX pipeline.

## PPTAgent

- Installed at `/tools/pptagent`
- CLI scripts: run from `/tools/pptagent` (e.g., `cd /tools/pptagent && npx tsx scripts/flatten.ts ...`)
- Browser: always use `launchBrowser()` — do NOT use `chromium.launch()` directly
- Slide size: 1280 × 720 px

## Output Paths

| Path | What |
|---|---|
| `/home/oai/share/answer.html` | Final fixed HTML slide |
| `/home/oai/share/answer.js` | Reads answer.html, converts to PPTX — must produce `answer.pptx` when run with `node` |
| `/home/oai/share/answer.pptx` | Final PPTX output (produced by answer.js) |
| Rollout dir | Specified in task instructions — save all intermediate artifacts there |

## Visual QA

Render your PPTX to images for visual verification:

```bash
python /home/oai/share/render_slides.py /home/oai/share/answer.pptx
```
