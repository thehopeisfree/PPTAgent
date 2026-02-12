<!-- This file is injected by the RL framework at runtime. It is NOT included in the PPTAgent tarball. -->

# Slide Generation Task

Given a slide description, produce two files:
- **`/home/oai/share/answer.js`** — Node.js ESM script that converts answer.html to PPTX
- **`/home/oai/share/answer.pptx`** — the final 1280×720 slide (produced by running answer.js)

⚠️ **Read `/shared/pptagent-skill.md` first.** It contains the full workflow, HTML format, constraints, and CLI commands. Follow it exactly.

## File Paths

| File | Path |
|------|------|
| Skill docs | `/shared/pptagent-skill.md` |
| Initial HTML | `/home/oai/share/slide.html` |
| Flattened HTML | `/home/oai/share/abs.html` |
| Final HTML | `/home/oai/share/answer.html` |
| answer.js | `/home/oai/share/answer.js` |
| answer.pptx | `/home/oai/share/answer.pptx` |
| Rollout dir | Specified in task instructions |

## answer.js Template

```javascript
import { htmlToPptxFile } from '/tools/pptagent/dist/index.js';
import fs from 'node:fs';

const html = fs.readFileSync('/home/oai/share/answer.html', 'utf-8');
await htmlToPptxFile(html, '/home/oai/share/answer.pptx');
```

## Visual QA

After producing answer.pptx, render to images and verify:

```bash
python /home/oai/share/render_slides.py /home/oai/share/answer.pptx
```
