<!-- This file is injected by the RL framework at runtime. It is NOT included in the PPTAgent tarball. -->

# Slide Generation Task

Given a slide description, produce:
- **`/home/oai/share/answer.pptx`** — the final 1280×720 slide

⚠️ **Read `/shared/pptagent-skill.md` first.** It contains the full workflow, HTML format, constraints, and CLI commands. Follow it exactly.

## File Paths

| File | Path | Notes |
|------|------|-------|
| Skill docs | `/shared/pptagent-skill.md` | Read this first |
| Initial HTML | `/home/oai/share/slide.html` | **You create this** (Step 2 in skill docs) |
| Flattened HTML | `/home/oai/share/abs.html` | Produced by flatten CLI |
| Final PPTX | `/home/oai/share/answer.pptx` | Produced by to-pptx CLI |
| Rollout dir | `/home/oai/share/rollout` | For diagnostics artifacts |

## Workflow Summary

Follow the steps in `/shared/pptagent-skill.md`. The key commands are:

```bash
# 1. Write slide.html (you do this manually — see skill docs for template)

# 2. Flatten to absolute positioning
cd /tools/pptagent && node bin/flatten.js /home/oai/share/slide.html /home/oai/share/abs.html

# 3. Run diagnostics (loop until exit 0 — see skill docs Step 5)
cd /tools/pptagent && node bin/check-slide.js /home/oai/share/abs.html --outdir /home/oai/share/rollout --iter 0

# 4. Convert to PPTX
cd /tools/pptagent && node bin/to-pptx.js /home/oai/share/abs.html /home/oai/share/answer.pptx
```

## Visual QA

After producing answer.pptx, render to images and verify:

```bash
python /home/oai/share/render_slides.py /home/oai/share/answer.pptx
```
