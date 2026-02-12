<!-- Injected by the RL framework at runtime. NOT included in the PPTAgent tarball. -->

# Slide Generation Task

Produce **`/home/oai/share/answer.pptx`** — a single 1280×720 slide from the description at the end of this prompt.

## Environment

- Node.js, Python, Chromium are pre-installed
- PPTAgent CLI is at `/tools/pptagent/bin/` — use only the CLI commands documented in the skill docs
- **`apply_patch`** is on PATH — use it whenever you need to edit a file

## Files

| File | Path | Action |
|------|------|--------|
| Skill docs | `/shared/pptagent-skill.md` | Read first |
| Initial HTML | `/home/oai/share/slide.html` | You create |
| Flattened HTML | `/home/oai/share/abs.html` | Read + edit in diag loop |
| Final PPTX | `/home/oai/share/answer.pptx` | Output |
| Rollout dir | `/home/oai/share/rollout` | Output (auto-populated) |

## Task

1. **Read** `/shared/pptagent-skill.md` — it has the HTML template, constraints, and all CLI commands
2. **Create** `slide.html` → **flatten** → **diagnose & fix loop** → **convert to PPTX** (follow skill docs)
3. **Archive**: `tar -czf /home/oai/share/pptagent_rollout.tar.gz -C /home/oai/share rollout`
4. **Verify**: `python /home/oai/share/render_slides.py /home/oai/share/answer.pptx`
