import type { IRDocument, IRElement } from "../schema/ir.js";
import type { DOMDocument, DOMElement, Rect } from "../schema/dom.js";
import type { DiagDocument, Defect, Warning } from "../schema/diag.js";
import type { Override } from "../schema/trace.js";
import type { PatchDocument } from "../schema/patch.js";
import { renderHTML } from "../renderer/html-renderer.js";
import { intersectRects } from "../utils/geometry.js";
import { SLIDE_W, SLIDE_H } from "../constants.js";

export interface DebugSnapshot {
  iter: number;
  ir: IRDocument;
  dom: DOMDocument;
  diag: DiagDocument;
  overrides?: Override[];
  patch?: PatchDocument;
  fingerprint?: string;
  tabooFingerprints?: string[];
}

/** Generate a self-contained debug HTML string */
export function generateDebugHTML(snapshots: DebugSnapshot[]): string {
  if (snapshots.length === 0) {
    return "<!DOCTYPE html><html><body><p>No snapshots provided.</p></body></html>";
  }

  const first = snapshots[0]!;
  const slideW = first.ir.slide.w ?? SLIDE_W;
  const slideH = first.ir.slide.h ?? SLIDE_H;

  // Build per-iteration data
  const iterData = snapshots.map((snap, i) => ({
    iter: snap.iter,
    slideHTML: extractSlideDiv(renderHTML(snap.ir)),
    overlays: buildOverlaySVG(snap, slideW, slideH) +
      (i > 0 ? buildDiffOverlay(snapshots[i - 1]!, snap, slideW, slideH) : ""),
    diagJSON: JSON.stringify(snap.diag, null, 2),
    patchJSON: snap.patch
      ? JSON.stringify(snap.patch, null, 2)
      : null,
    overridesJSON: snap.overrides
      ? JSON.stringify(snap.overrides, null, 2)
      : null,
    elements: buildElementData(snap),
    summary: snap.diag.summary,
    fingerprint: snap.fingerprint ?? null,
    tabooFingerprints: snap.tabooFingerprints ?? [],
  }));

  const iterDataJSON = escapeForScript(JSON.stringify(iterData.map((d) => ({
    iter: d.iter,
    diagJSON: d.diagJSON,
    patchJSON: d.patchJSON,
    overridesJSON: d.overridesJSON,
    elements: d.elements,
    summary: d.summary,
    fingerprint: d.fingerprint,
    tabooFingerprints: d.tabooFingerprints,
  }))));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>PPTAgent Visual Debug</title>
<style>
${CSS_CONTENT}
</style>
</head>
<body>
<div id="app">
  <div id="toolbar">
    <h1>PPTAgent Visual Debug</h1>
    <div id="tabs">
      ${iterData.map((d, i) => `<button class="tab${i === 0 ? " active" : ""}" data-iter="${i}" onclick="switchIter(${i})">Iter ${d.iter}${i === 0 ? " (initial)" : ""}<span class="tab-badge">${d.summary.defect_count}D / ${d.summary.warning_count}W</span></button>`).join("\n      ")}
    </div>
    <div id="toggles">
      <label style="font-weight:bold;border-right:1px solid #cbd5e1;padding-right:8px;margin-right:4px"><input type="checkbox" checked id="toggle-invert" onchange="invertAll()"> all</label>
      <label><input type="checkbox" checked data-layer="bbox" onchange="toggleLayer('bbox', this.checked)"> <span class="swatch" style="border:2px solid #3b82f6"></span> bbox</label>
      <label><input type="checkbox" checked data-layer="safebox" onchange="toggleLayer('safebox', this.checked)"> <span class="swatch" style="border:2px dashed #8b5cf6"></span> safeBox</label>
      <label><input type="checkbox" checked data-layer="contentbox" onchange="toggleLayer('contentbox', this.checked)"> <span class="swatch" style="border:2px dotted #22c55e"></span> contentBox</label>
      <label><input type="checkbox" checked data-layer="overlap" onchange="toggleLayer('overlap', this.checked)"> <span class="swatch" style="background:rgba(239,68,68,0.25)"></span> overlaps</label>
      <label><input type="checkbox" checked data-layer="oob" onchange="toggleLayer('oob', this.checked)"> <span class="swatch" style="border:2px solid #ef4444"></span> out of bounds</label>
      <label><input type="checkbox" checked data-layer="badge" onchange="toggleLayer('badge', this.checked)"> <span class="swatch" style="background:#dc2626;color:#fff;font-size:9px;padding:0 3px">!</span> defect labels</label>
      <label><input type="checkbox" checked data-layer="hint" onchange="toggleLayer('hint', this.checked)"> <span class="swatch" style="border:2px dashed #22c55e"></span> hints</label>
      <label><input type="checkbox" checked data-layer="conflict" onchange="toggleLayer('conflict', this.checked)"> <span class="swatch" style="border:2px solid #f59e0b"></span> conflicts</label>
      <label><input type="checkbox" checked data-layer="diff" onchange="toggleLayer('diff', this.checked)"> <span class="swatch" style="border:2px solid #a78bfa"></span> diff</label>
    </div>
  </div>
  <div id="timeline">
    <div id="timeline-controls">
      <button id="btn-step-back" onclick="stepBack()" title="Previous (←)">\u25C1</button>
      <button id="btn-play" onclick="togglePlay()" title="Play/Pause (Space)">\u25B6</button>
      <button id="btn-step-fwd" onclick="stepForward()" title="Next (→)">\u25B7</button>
      <select id="speed-select" onchange="setSpeed(+this.value)">
        <option value="500">0.5s</option>
        <option value="1000" selected>1s</option>
        <option value="2000">2s</option>
      </select>
    </div>
    <div id="timeline-track">
      <div id="timeline-progress"></div>
      ${iterData.map((d, i) => {
        const isTaboo = d.fingerprint && d.tabooFingerprints.includes(d.fingerprint);
        return `<div class="timeline-marker${i === 0 ? " active" : ""}${isTaboo ? " taboo" : ""}" data-idx="${i}" onclick="jumpTo(${i})" title="Iter ${d.iter}">
          <span class="marker-dot"></span>
          <span class="marker-label">Iter ${d.iter}</span>
          <span class="marker-badge">${d.summary.defect_count}D</span>
        </div>`;
      }).join("\n      ")}
    </div>
  </div>
  <div id="main">
    <div id="slide-area">
      <div id="slide-container" style="width:${slideW}px;height:${slideH}px;">
        ${iterData.map((d, i) => `<div class="iter-slide" data-iter="${i}" style="display:${i === 0 ? "block" : "none"}">
          <div class="slide-base">${d.slideHTML}</div>
          <svg class="overlay-svg" width="${slideW}" height="${slideH}" viewBox="0 0 ${slideW} ${slideH}">
            <defs>
              <marker id="diff-arrow-g" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#22c55e" /></marker>
              <marker id="diff-arrow-r" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#ef4444" /></marker>
            </defs>
            ${d.overlays}
          </svg>
        </div>`).join("\n        ")}
        <div id="anim-layer"></div>
      </div>
      <div id="tooltip"></div>
    </div>
    <div id="panel">
      <div id="panel-header">
        <div id="panel-tabs">
          <button class="panel-tab active" data-ptab="diag" onclick="switchPanelTab('diag')">Diagnostics</button>
          <button class="panel-tab" data-ptab="patch" onclick="switchPanelTab('patch')">Patch</button>
          <button class="panel-tab" data-ptab="overrides" onclick="switchPanelTab('overrides')">Overrides</button>
        </div>
        <button onclick="togglePanel()" style="margin-left:auto;flex-shrink:0">\u2715</button>
      </div>
      <pre id="panel-content">${escapeHtml(iterData[0]!.diagJSON)}</pre>
    </div>
  </div>
</div>
<script>
var iterDataMeta = ${iterDataJSON};
var currentIter = 0;
var activePanelTab = 'diag';
var playing = false;
var playTimer = null;
var playSpeed = 1000;
var animating = false;

// ── Panel sub-tabs ──
function switchPanelTab(tab) {
  activePanelTab = tab;
  document.querySelectorAll('.panel-tab').forEach(function(b) { b.classList.remove('active'); });
  document.querySelector('.panel-tab[data-ptab="' + tab + '"]').classList.add('active');
  updatePanelContent();
}

function updatePanelContent() {
  var meta = iterDataMeta[currentIter];
  var content = '';
  if (activePanelTab === 'diag') {
    content = meta.diagJSON;
  } else if (activePanelTab === 'patch') {
    content = meta.patchJSON || '(initial iteration)';
  } else if (activePanelTab === 'overrides') {
    content = meta.overridesJSON || '(none)';
  }
  document.getElementById('panel-content').textContent = content;
}

function switchIter(idx) {
  currentIter = idx;
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab')[idx].classList.add('active');
  document.querySelectorAll('.iter-slide').forEach(function(s) {
    s.style.display = s.dataset.iter == idx ? 'block' : 'none';
  });
  // Update timeline markers
  document.querySelectorAll('.timeline-marker').forEach(function(m) {
    m.classList.toggle('active', +m.dataset.idx === idx);
  });
  // Update progress bar
  var total = iterDataMeta.length - 1;
  var pct = total > 0 ? (idx / total * 100) : 0;
  document.getElementById('timeline-progress').style.width = pct + '%';
  updatePanelContent();
}

function invertAll() {
  var boxes = document.querySelectorAll('#toggles input[data-layer]');
  boxes.forEach(function(cb) {
    cb.checked = !cb.checked;
    toggleLayer(cb.getAttribute('data-layer'), cb.checked);
  });
}

function toggleLayer(layer, show) {
  var slides = document.querySelectorAll('.iter-slide');
  slides.forEach(function(s) {
    s.querySelectorAll('[data-layer="' + layer + '"]').forEach(function(el) {
      el.style.display = show ? '' : 'none';
    });
  });
}

function togglePanel() {
  var panel = document.getElementById('panel');
  panel.classList.toggle('collapsed');
}

// ── Animation layer ──
var typeColors = { text: '#3b82f6', title: '#3b82f6', bullets: '#3b82f6', image: '#22c55e', decoration: '#6b7280' };

function transitionTo(targetIdx) {
  if (animating || targetIdx < 0 || targetIdx >= iterDataMeta.length) return;
  if (targetIdx === currentIter) return;
  var fromIdx = currentIter;
  // Non-adjacent: skip animation
  if (Math.abs(targetIdx - fromIdx) > 1) {
    switchIter(targetIdx);
    return;
  }
  animating = true;
  var fromElems = iterDataMeta[fromIdx].elements;
  var toElems = iterDataMeta[targetIdx].elements;
  var layer = document.getElementById('anim-layer');
  layer.innerHTML = '';

  // Build animated rects from source positions
  var rects = [];
  for (var i = 0; i < fromElems.length; i++) {
    var fe = fromElems[i];
    var te = null;
    for (var j = 0; j < toElems.length; j++) {
      if (toElems[j].eid === fe.eid) { te = toElems[j]; break; }
    }
    if (!te) continue;
    var div = document.createElement('div');
    div.className = 'anim-rect';
    var c = typeColors[fe.type] || '#6b7280';
    div.style.cssText = 'position:absolute;border:2px solid ' + c + ';background:' + c + '20;' +
      'left:' + fe.bbox.x + 'px;top:' + fe.bbox.y + 'px;width:' + fe.bbox.w + 'px;height:' + fe.bbox.h + 'px;' +
      'transition:all 0.4s ease-in-out;pointer-events:none;border-radius:3px;';
    var label = document.createElement('span');
    label.style.cssText = 'position:absolute;top:2px;left:4px;font-size:9px;color:' + c + ';font-family:monospace;opacity:0.8;';
    label.textContent = fe.eid;
    div.appendChild(label);
    layer.appendChild(div);
    rects.push({ div: div, target: te.bbox });
  }

  layer.style.display = 'block';
  // Force reflow
  void layer.offsetHeight;
  // Animate to target
  for (var k = 0; k < rects.length; k++) {
    var r = rects[k];
    r.div.style.left = r.target.x + 'px';
    r.div.style.top = r.target.y + 'px';
    r.div.style.width = r.target.w + 'px';
    r.div.style.height = r.target.h + 'px';
  }

  setTimeout(function() {
    layer.style.display = 'none';
    layer.innerHTML = '';
    switchIter(targetIdx);
    animating = false;
  }, 450);
}

// ── Play/Pause ──
function togglePlay() {
  if (playing) {
    stopPlay();
  } else {
    playing = true;
    document.getElementById('btn-play').textContent = '\u23F8';
    advancePlay();
  }
}

function advancePlay() {
  if (!playing) return;
  var next = currentIter + 1;
  if (next >= iterDataMeta.length) {
    stopPlay();
    return;
  }
  transitionTo(next);
  playTimer = setTimeout(advancePlay, playSpeed + 500);
}

function stopPlay() {
  playing = false;
  if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  document.getElementById('btn-play').textContent = '\u25B6';
}

function setSpeed(ms) {
  playSpeed = ms;
}

function stepBack() {
  stopPlay();
  transitionTo(currentIter - 1);
}

function stepForward() {
  stopPlay();
  transitionTo(currentIter + 1);
}

function jumpTo(idx) {
  stopPlay();
  if (Math.abs(idx - currentIter) <= 1) {
    transitionTo(idx);
  } else {
    switchIter(idx);
  }
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  switch (e.key) {
    case 'ArrowLeft': case 'h': e.preventDefault(); stepBack(); break;
    case 'ArrowRight': case 'l': e.preventDefault(); stepForward(); break;
    case ' ': e.preventDefault(); togglePlay(); break;
    default:
      if (e.key >= '0' && e.key <= '9') {
        var n = +e.key;
        if (n < iterDataMeta.length) jumpTo(n);
      }
  }
});

// ── Highlight helpers ──
function highlightChain(eid) {
  document.querySelectorAll('.conflict-elem, .conflict-panel-row').forEach(function(g) {
    if (g.dataset.conflictEid === eid) g.classList.add('active');
  });
}
function clearChain() {
  document.querySelectorAll('.conflict-elem.active, .conflict-panel-row.active').forEach(function(g) {
    g.classList.remove('active');
  });
}
function highlightDefect(eid) {
  document.querySelectorAll('.defect-group').forEach(function(g) {
    if (g.dataset.defectEid === eid) g.classList.add('active');
  });
}
function clearDefect() {
  document.querySelectorAll('.defect-group.active').forEach(function(g) {
    g.classList.remove('active');
  });
}

// ── Unified hover handler ──
var hoverRaf = null;
document.addEventListener('mouseover', function(e) {
  if (hoverRaf) cancelAnimationFrame(hoverRaf);
  hoverRaf = requestAnimationFrame(function() {
    var target = e.target;
    clearChain();
    clearDefect();

    if (target.closest) {
      var cg = target.closest('.conflict-elem') || target.closest('.conflict-panel-row');
      if (cg && cg.dataset.conflictEid) highlightChain(cg.dataset.conflictEid);
      var dg = target.closest('.defect-group');
      if (dg && dg.dataset.defectEid) highlightDefect(dg.dataset.defectEid);
    }

    var eidTarget = target;
    while (eidTarget && eidTarget !== document.body) {
      if (eidTarget.dataset && eidTarget.dataset.eid) break;
      eidTarget = eidTarget.parentElement;
    }
    if (eidTarget && eidTarget.dataset && eidTarget.dataset.eid) {
      var eid = eidTarget.dataset.eid;
      highlightDefect(eid);
      var meta = iterDataMeta[currentIter];
      var elem = meta.elements.find(function(el) { return el.eid === eid; });
      if (elem) {
        var tip = document.getElementById('tooltip');
        var lines = ['<b>' + eid + '</b>', 'type: ' + elem.type, 'priority: ' + elem.priority];
        if (elem.defects.length > 0) {
          lines.push('<hr>');
          elem.defects.forEach(function(d) { lines.push('<span class="tip-defect">' + d.type + '</span> sev=' + d.severity); });
        }
        tip.innerHTML = lines.join('<br>');
        tip.style.display = 'block';
        var rect = eidTarget.getBoundingClientRect();
        tip.style.left = (rect.right + 8) + 'px';
        tip.style.top = rect.top + 'px';
      }
    } else {
      document.getElementById('tooltip').style.display = 'none';
    }
  });
});

document.addEventListener('mouseout', function(e) {
  var related = e.relatedTarget;
  if (!related || !related.closest) {
    clearChain(); clearDefect();
    document.getElementById('tooltip').style.display = 'none';
    return;
  }
  if (!related.closest('.conflict-elem') && !related.closest('.conflict-panel-row')) clearChain();
  if (!related.closest('.defect-group') && !related.closest('[data-eid]')) clearDefect();
  var inEid = related;
  while (inEid && inEid !== document.body) {
    if (inEid.dataset && inEid.dataset.eid) break;
    inEid = inEid.parentElement;
  }
  if (!inEid || !inEid.dataset || !inEid.dataset.eid) {
    document.getElementById('tooltip').style.display = 'none';
  }
});
</script>
</body>
</html>`;
}

// ── Helpers ──

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeForScript(s: string): string {
  return s.replace(/<\//g, "<\\/");
}

/** Extract just the #slide div content from the full HTML */
function extractSlideDiv(html: string): string {
  const startMarker = '<div id="slide">';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return "";
  // Find the matching closing — the slide div ends before </body>
  const endMarker = "</div>\n</body>";
  const endIdx = html.indexOf(endMarker, startIdx);
  if (endIdx === -1) {
    // Fallback: take from startMarker to </body>
    const bodyEnd = html.indexOf("</body>");
    if (bodyEnd === -1) return "";
    return html.slice(startIdx, bodyEnd);
  }
  return html.slice(startIdx, endIdx + "</div>".length);
}

interface ElementMeta {
  eid: string;
  type: string;
  priority: number;
  defects: Array<{ type: string; severity: number }>;
  bbox: { x: number; y: number; w: number; h: number };
  fontSize?: number;
}

function buildElementData(snap: DebugSnapshot): ElementMeta[] {
  const irMap = new Map<string, IRElement>();
  for (const el of snap.ir.elements) irMap.set(el.eid, el);

  return snap.dom.elements.map((domEl) => {
    const irEl = irMap.get(domEl.eid);
    const defects = snap.diag.defects
      .filter((d) => d.eid === domEl.eid || d.owner_eid === domEl.eid)
      .map((d) => ({ type: d.type, severity: d.severity }));
    return {
      eid: domEl.eid,
      type: irEl?.type ?? "unknown",
      priority: irEl?.priority ?? 0,
      defects,
      bbox: { x: domEl.bbox.x, y: domEl.bbox.y, w: domEl.bbox.w, h: domEl.bbox.h },
      fontSize: irEl?.style.fontSize,
    };
  });
}

/** Build diff overlay SVG comparing two consecutive snapshots */
function buildDiffOverlay(prev: DebugSnapshot, curr: DebugSnapshot, slideW: number, slideH: number): string {
  const parts: string[] = [];
  const prevIRMap = new Map<string, IRElement>();
  for (const el of prev.ir.elements) prevIRMap.set(el.eid, el);
  const currIRMap = new Map<string, IRElement>();
  for (const el of curr.ir.elements) currIRMap.set(el.eid, el);

  // Severity per element in prev vs curr — for coloring improvements vs regressions
  const prevSev = new Map<string, number>();
  for (const d of prev.diag.defects) {
    const eid = d.eid ?? d.owner_eid ?? "";
    prevSev.set(eid, (prevSev.get(eid) ?? 0) + d.severity);
  }
  const currSev = new Map<string, number>();
  for (const d of curr.diag.defects) {
    const eid = d.eid ?? d.owner_eid ?? "";
    currSev.set(eid, (currSev.get(eid) ?? 0) + d.severity);
  }

  // Collect per-defect hints for comparison
  const hintMap = new Map<string, { suggested_y?: number; suggested_h?: number; suggested_x?: number; suggested_w?: number }>();
  for (const d of prev.diag.defects) {
    if (!d.hint) continue;
    const eid = d.hint.target_eid ?? d.eid ?? d.owner_eid ?? "";
    if (!hintMap.has(eid)) {
      hintMap.set(eid, d.hint);
    }
  }

  const tagW = 46;
  const tagColor = "#a78bfa"; // purple for ACTUAL

  parts.push(`<g data-layer="diff">`);

  for (const currEl of curr.ir.elements) {
    const prevEl = prevIRMap.get(currEl.eid);
    if (!prevEl) continue;

    const pl = prevEl.layout;
    const cl = currEl.layout;
    const improved = (currSev.get(currEl.eid) ?? 0) < (prevSev.get(currEl.eid) ?? 0);
    const color = improved ? "#22c55e" : "#ef4444";
    const hint = hintMap.get(currEl.eid);

    const hasMoved = pl.x !== cl.x || pl.y !== cl.y;
    const hasResized = pl.w !== cl.w || pl.h !== cl.h;
    const hasFontChange = prevEl.style.fontSize != null && currEl.style.fontSize != null &&
      prevEl.style.fontSize !== currEl.style.fontSize;

    if (!hasMoved && !hasResized && !hasFontChange) continue;

    // Ghost rect at old position (dashed outline)
    if (hasMoved || hasResized) {
      parts.push(
        `<rect x="${pl.x}" y="${pl.y}" width="${pl.w}" height="${pl.h}" ` +
        `fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.5" />`
      );
    }

    // Movement arrow: old center → new center
    if (hasMoved) {
      const oldCX = pl.x + pl.w / 2;
      const oldCY = pl.y + pl.h / 2;
      const newCX = cl.x + cl.w / 2;
      const newCY = cl.y + cl.h / 2;
      parts.push(
        `<line x1="${oldCX}" y1="${oldCY}" x2="${newCX}" y2="${newCY}" ` +
        `stroke="${color}" stroke-width="2" marker-end="url(#diff-arrow-${improved ? "g" : "r"})" />`
      );
      // Delta label with ACTUAL tag
      const labels: string[] = [];
      if (pl.x !== cl.x) labels.push(`x: ${Math.round(pl.x)}\u2192${Math.round(cl.x)}`);
      if (pl.y !== cl.y) labels.push(`y: ${Math.round(pl.y)}\u2192${Math.round(cl.y)}`);
      const labelText = labels.join("  ");
      const lx = (oldCX + newCX) / 2 + 6;
      const ly = (oldCY + newCY) / 2 - 6;
      const lw = labelText.length * 6 + tagW + 14;
      parts.push(
        `<rect x="${lx}" y="${ly - 10}" width="${lw}" height="14" rx="2" fill="rgba(15,15,25,0.8)" />` +
        `<rect x="${lx}" y="${ly - 10}" width="${tagW}" height="14" rx="2" fill="${tagColor}" />` +
        `<text x="${lx + 3}" y="${ly + 1}" fill="white" font-size="9" font-weight="bold" font-family="system-ui, sans-serif">ACTUAL</text>` +
        `<text x="${lx + tagW + 5}" y="${ly + 1}" fill="${color}" font-size="10" font-family="system-ui, sans-serif">${escapeHtml(labelText)}</text>`
      );

      // Hint comparison line — show what the chain suggested vs what actually happened
      if (hint) {
        const hintParts: string[] = [];
        if (hint.suggested_x != null && pl.x !== cl.x) {
          const hintVal = Math.round(hint.suggested_x);
          const actualVal = Math.round(cl.x);
          if (hintVal !== actualVal) hintParts.push(`x: hint ${hintVal} vs actual ${actualVal}`);
        }
        if (hint.suggested_y != null && pl.y !== cl.y) {
          const hintVal = Math.round(hint.suggested_y);
          const actualVal = Math.round(cl.y);
          if (hintVal !== actualVal) hintParts.push(`y: hint ${hintVal} vs actual ${actualVal}`);
        }
        if (hintParts.length > 0) {
          const cmpText = hintParts.join("  ");
          const cmpLw = cmpText.length * 5.5 + 10;
          const cmpY = ly + 6;
          parts.push(
            `<rect x="${lx}" y="${cmpY}" width="${cmpLw}" height="12" rx="2" fill="rgba(167,139,250,0.15)" stroke="${tagColor}" stroke-width="0.5" />` +
            `<text x="${lx + 5}" y="${cmpY + 9}" fill="${tagColor}" font-size="9" font-family="system-ui, sans-serif">${escapeHtml(cmpText)}</text>`
          );
        }
      }
    }

    // Size change label with ACTUAL tag
    if (hasResized) {
      const labels: string[] = [];
      if (pl.w !== cl.w) labels.push(`w: ${Math.round(pl.w)}\u2192${Math.round(cl.w)}`);
      if (pl.h !== cl.h) labels.push(`h: ${Math.round(pl.h)}\u2192${Math.round(cl.h)}`);
      const labelText = labels.join("  ");
      const lx = cl.x + cl.w + 4;
      const ly = cl.y + cl.h / 2;
      const lw = labelText.length * 6 + tagW + 14;
      parts.push(
        `<rect x="${lx}" y="${ly - 8}" width="${lw}" height="14" rx="2" fill="rgba(15,15,25,0.8)" />` +
        `<rect x="${lx}" y="${ly - 8}" width="${tagW}" height="14" rx="2" fill="${tagColor}" />` +
        `<text x="${lx + 3}" y="${ly + 3}" fill="white" font-size="9" font-weight="bold" font-family="system-ui, sans-serif">ACTUAL</text>` +
        `<text x="${lx + tagW + 5}" y="${ly + 3}" fill="${color}" font-size="10" font-family="system-ui, sans-serif">${escapeHtml(labelText)}</text>`
      );

      // Hint comparison for size
      if (hint) {
        const hintParts: string[] = [];
        if (hint.suggested_w != null && pl.w !== cl.w) {
          const hintVal = Math.round(hint.suggested_w);
          const actualVal = Math.round(cl.w);
          if (hintVal !== actualVal) hintParts.push(`w: hint ${hintVal} vs actual ${actualVal}`);
        }
        if (hint.suggested_h != null && pl.h !== cl.h) {
          const hintVal = Math.round(hint.suggested_h);
          const actualVal = Math.round(cl.h);
          if (hintVal !== actualVal) hintParts.push(`h: hint ${hintVal} vs actual ${actualVal}`);
        }
        if (hintParts.length > 0) {
          const cmpText = hintParts.join("  ");
          const cmpLw = cmpText.length * 5.5 + 10;
          const cmpY = ly + 8;
          parts.push(
            `<rect x="${lx}" y="${cmpY}" width="${cmpLw}" height="12" rx="2" fill="rgba(167,139,250,0.15)" stroke="${tagColor}" stroke-width="0.5" />` +
            `<text x="${lx + 5}" y="${cmpY + 9}" fill="${tagColor}" font-size="9" font-family="system-ui, sans-serif">${escapeHtml(cmpText)}</text>`
          );
        }
      }
    }

    // Font size change badge
    if (hasFontChange) {
      const oldFs = prevEl.style.fontSize!;
      const newFs = currEl.style.fontSize!;
      const fontColor = newFs > oldFs ? "#22c55e" : "#ef4444";
      const badgeText = `${oldFs}px\u2192${newFs}px`;
      const bx = cl.x;
      const by = cl.y - 16;
      const bw = badgeText.length * 6.5 + 10;
      parts.push(
        `<rect x="${bx}" y="${by}" width="${bw}" height="14" rx="3" fill="${fontColor}" opacity="0.85" />` +
        `<text x="${bx + 5}" y="${by + 11}" fill="white" font-size="10" font-family="system-ui, sans-serif">${escapeHtml(badgeText)}</text>`
      );
    }
  }

  parts.push(`</g>`);
  return parts.join("\n            ");
}

function buildOverlaySVG(snap: DebugSnapshot, slideW: number, slideH: number): string {
  const parts: string[] = [];
  const irMap = new Map<string, IRElement>();
  for (const el of snap.ir.elements) irMap.set(el.eid, el);

  for (const domEl of snap.dom.elements) {
    const irEl = irMap.get(domEl.eid);
    if (!irEl) continue;

    // bbox
    parts.push(svgRect(domEl.bbox, {
      stroke: "#3b82f6",
      strokeWidth: 1,
      fill: "none",
      dashArray: undefined,
      layer: "bbox",
      eid: domEl.eid,
    }));

    // safeBox
    parts.push(svgRect(domEl.safeBox, {
      stroke: "#8b5cf6",
      strokeWidth: 1,
      fill: "none",
      dashArray: "4,3",
      layer: "safebox",
      eid: domEl.eid,
    }));

    // contentBox
    if (domEl.contentBox) {
      const hasOverflow = snap.diag.defects.some(
        (d) => d.type === "content_overflow" && (d.eid === domEl.eid || d.owner_eid === domEl.eid)
      );
      parts.push(svgRect(domEl.contentBox, {
        stroke: hasOverflow ? "#ef4444" : "#22c55e",
        strokeWidth: hasOverflow ? 2 : 1,
        fill: "none",
        dashArray: "2,2",
        layer: "contentbox",
        eid: domEl.eid,
      }));
    }
  }

  // Overlap zones
  const overlapDefects = snap.diag.defects.filter((d) => d.type === "overlap");
  for (const defect of overlapDefects) {
    const ownerDom = snap.dom.elements.find((e) => e.eid === defect.owner_eid);
    const otherDom = snap.dom.elements.find((e) => e.eid === defect.other_eid);
    if (ownerDom && otherDom) {
      const inter = intersectRects(ownerDom.safeBox, otherDom.safeBox);
      if (inter) {
        parts.push(svgRect(inter, {
          stroke: "none",
          strokeWidth: 0,
          fill: "rgba(239,68,68,0.25)",
          dashArray: undefined,
          layer: "overlap",
        }));
      }
    }
  }

  // OOB — element-specific visualization
  for (const defect of snap.diag.defects) {
    if (defect.type !== "out_of_bounds") continue;
    const details = defect.details as { edge: string; by_px: number };
    const eid = defect.eid ?? defect.owner_eid ?? "";
    const domEl = snap.dom.elements.find((e) => e.eid === eid);
    parts.push(buildOOBOverlay(details.edge, details.by_px, slideW, slideH, eid, domEl));
  }

  // Defect labels — hover-to-highlight with connector lines + inline problem areas
  for (const domEl of snap.dom.elements) {
    const defects = snap.diag.defects.filter(
      (d) => d.eid === domEl.eid || d.owner_eid === domEl.eid
    );
    if (defects.length === 0) continue;
    const b = domEl.bbox;
    const badgeX = b.x + b.w + 20;
    const badgeY = b.y;
    parts.push(`<g class="defect-group" data-layer="badge" data-defect-eid="${escapeHtml(domEl.eid)}">`);

    // Highlight border on the owning element (visible on hover)
    parts.push(
      `<rect x="${b.x - 1}" y="${b.y - 1}" width="${b.w + 2}" height="${b.h + 2}" ` +
      `fill="none" stroke="#ef4444" stroke-width="2.5" stroke-dasharray="6,3" />`
    );

    for (let i = 0; i < defects.length; i++) {
      const d = defects[i]!;
      const color = badgeColor(d.type);
      const label = defectLabel(d);
      const yOff = badgeY + i * 22;
      const textW = label.length * 6.5 + 12;

      // Connector line from element edge to badge
      parts.push(
        `<line x1="${b.x + b.w}" y1="${yOff + 9}" x2="${badgeX}" y2="${yOff + 9}" ` +
        `stroke="${color}" stroke-width="1" stroke-dasharray="3,2" />`
      );

      // Badge
      parts.push(
        `<rect x="${badgeX}" y="${yOff}" width="${textW}" height="18" rx="3" fill="${color}" opacity="0.92" />` +
        `<text x="${badgeX + 6}" y="${yOff + 13}" fill="white" font-size="11" font-family="system-ui, sans-serif">${escapeHtml(label)}</text>`
      );

      // ── Inline problem-area visualizations ──
      if (d.type === "overlap") {
        // Show the overlap zone + highlight the other element
        const otherDom = snap.dom.elements.find((e) => e.eid === d.other_eid);
        if (otherDom) {
          const inter = intersectRects(domEl.safeBox, otherDom.safeBox);
          if (inter) {
            // Hatched overlap zone
            parts.push(
              `<rect x="${inter.x}" y="${inter.y}" width="${inter.w}" height="${inter.h}" ` +
              `fill="rgba(239,68,68,0.3)" stroke="#ef4444" stroke-width="1.5" />`
            );
            // Diagonal hatch lines in the overlap zone
            const step = 8;
            for (let off = 0; off < inter.w + inter.h; off += step) {
              const lx1 = inter.x + Math.min(off, inter.w);
              const ly1 = inter.y + Math.max(0, off - inter.w);
              const lx2 = inter.x + Math.max(0, off - inter.h);
              const ly2 = inter.y + Math.min(off, inter.h);
              parts.push(
                `<line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" ` +
                `stroke="#ef4444" stroke-width="0.7" opacity="0.5" />`
              );
            }
          }
          // Dashed border on the other element
          const ob = otherDom.bbox;
          parts.push(
            `<rect x="${ob.x - 1}" y="${ob.y - 1}" width="${ob.w + 2}" height="${ob.h + 2}" ` +
            `fill="none" stroke="#f97316" stroke-width="1.5" stroke-dasharray="5,3" />`
          );
          // "vs" label connecting the two elements
          const midX = (b.x + b.w / 2 + ob.x + ob.w / 2) / 2;
          const midY = (b.y + b.h / 2 + ob.y + ob.h / 2) / 2;
          parts.push(
            `<rect x="${midX - 18}" y="${midY - 8}" width="36" height="16" rx="3" fill="#ef4444" opacity="0.85" />` +
            `<text x="${midX}" y="${midY + 4}" fill="white" font-size="9" font-weight="bold" ` +
            `font-family="system-ui, sans-serif" text-anchor="middle">overlap</text>`
          );
        }
      } else if (d.type === "content_overflow") {
        // Show the overflow area extending beyond the bbox
        const det = d.details as { overflow_x_px: number; overflow_y_px: number };
        if (det.overflow_y_px > 0) {
          parts.push(
            `<rect x="${b.x}" y="${b.y + b.h}" width="${b.w}" height="${det.overflow_y_px}" ` +
            `fill="rgba(239,68,68,0.15)" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,2" />`
          );
          // Down arrow + label
          const arrowX = b.x + b.w / 2;
          parts.push(
            `<line x1="${arrowX}" y1="${b.y + b.h}" x2="${arrowX}" y2="${b.y + b.h + det.overflow_y_px}" ` +
            `stroke="#ef4444" stroke-width="1.5" marker-end="url(#overflow-arrow)" />`
          );
          parts.push(
            `<rect x="${arrowX + 6}" y="${b.y + b.h + det.overflow_y_px / 2 - 7}" width="50" height="14" rx="2" fill="#dc2626" opacity="0.85" />` +
            `<text x="${arrowX + 10}" y="${b.y + b.h + det.overflow_y_px / 2 + 4}" fill="white" font-size="9" ` +
            `font-family="system-ui, sans-serif">+${Math.round(det.overflow_y_px)}px</text>`
          );
        }
        if (det.overflow_x_px > 0) {
          parts.push(
            `<rect x="${b.x + b.w}" y="${b.y}" width="${det.overflow_x_px}" height="${b.h}" ` +
            `fill="rgba(239,68,68,0.15)" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,2" />`
          );
          const arrowY = b.y + b.h / 2;
          parts.push(
            `<line x1="${b.x + b.w}" y1="${arrowY}" x2="${b.x + b.w + det.overflow_x_px}" y2="${arrowY}" ` +
            `stroke="#ef4444" stroke-width="1.5" marker-end="url(#overflow-arrow)" />`
          );
        }
      }
    }
    parts.push(`</g>`);
  }

  // Hint ghost rectangles
  for (const defect of snap.diag.defects) {
    if (!defect.hint) continue;
    const hint = defect.hint;
    if (hint.suggested_x == null && hint.suggested_y == null && hint.suggested_w == null && hint.suggested_h == null) continue;
    const eid = defect.eid ?? defect.owner_eid ?? hint.target_eid ?? "";
    const domEl = snap.dom.elements.find((e) => e.eid === (hint.target_eid ?? eid));
    if (!domEl) continue;
    const ghostRect: Rect = {
      x: hint.suggested_x ?? domEl.bbox.x,
      y: hint.suggested_y ?? domEl.bbox.y,
      w: hint.suggested_w ?? domEl.bbox.w,
      h: hint.suggested_h ?? domEl.bbox.h,
    };
    parts.push(svgRect(ghostRect, {
      stroke: "#22c55e",
      strokeWidth: 2,
      fill: "rgba(34,197,94,0.1)",
      dashArray: "6,3",
      layer: "hint",
      eid,
    }));
  }

  // Conflict graph — floating panels with edge lines + envelope arrows
  const conflictGraph = snap.diag.summary.conflict_graph ?? [];
  const defs = `<defs>` +
    `<marker id="overflow-arrow" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">` +
    `<polygon points="0 0, 6 2.5, 0 5" fill="#ef4444" /></marker>` +
    `</defs>`;

  if (conflictGraph.length > 0) {
    // Accumulate panel Y offset so multiple components stack vertically
    let nextPanelBottom = slideH;

    for (let ci = 0; ci < conflictGraph.length; ci++) {
      const comp = conflictGraph[ci]!;
      const accentColor = "#f59e0b";

      // ── Panel ──
      const rowH = 22;
      const headerH = 28;
      const padX = 14;
      const padY = 10;
      const panelX = 16;

      // Rows: one per edge + one per envelope
      const edgeRows = comp.edges.map((e) => {
        const best = e.separations[0];
        const alts = e.separations.slice(1).map((s) => `${s.direction.replace("move_", "")} ${s.cost_px}px`).join(", ");
        return `${e.owner_eid} \u2192 ${e.other_eid}: ${best ? best.direction.replace("move_", "") + " " + best.cost_px + "px" : "?"}${alts ? " (or: " + alts + ")" : ""}`;
      });
      const envRow = "Space: " + comp.envelopes.map((env) =>
        `${env.eid} \u2191${env.free_top} \u2193${env.free_bottom} \u2190${env.free_left} \u2192${env.free_right}`
      ).join(" | ");

      const allRows = [...edgeRows, envRow];
      let maxTextLen = 0;
      for (const row of allRows) maxTextLen = Math.max(maxTextLen, row.length);
      const panelW = Math.max(280, maxTextLen * 6.5 + padX * 2 + 12);
      const panelH = headerH + allRows.length * rowH + padY * 2;
      const panelY = nextPanelBottom - panelH - 16;
      nextPanelBottom = panelY;

      // Panel background
      parts.push(
        `<g data-layer="conflict">` +
        `<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="8" ` +
        `fill="rgba(15,15,25,0.92)" stroke="${accentColor}" stroke-width="1.5" />` +
        `</g>`
      );

      // Header
      parts.push(
        `<g data-layer="conflict">` +
        `<text x="${panelX + padX}" y="${panelY + headerH - 6}" fill="${accentColor}" ` +
        `font-size="13" font-weight="bold" font-family="system-ui, sans-serif">` +
        `Conflict group${conflictGraph.length > 1 ? ` #${ci + 1}` : ""} (${comp.eids.length} elements, ${comp.edges.length} edges)</text>` +
        `<line x1="${panelX + padX}" y1="${panelY + headerH}" ` +
        `x2="${panelX + panelW - padX}" y2="${panelY + headerH}" ` +
        `stroke="${accentColor}" stroke-width="0.5" opacity="0.4" />` +
        `</g>`
      );

      // Edge rows
      for (let ri = 0; ri < edgeRows.length; ri++) {
        const eid = comp.edges[ri]!.owner_eid;
        const cy = panelY + headerH + padY + ri * rowH + 14;
        parts.push(
          `<g class="conflict-panel-row" data-conflict-eid="${escapeHtml(eid)}" data-layer="conflict">` +
          `<rect x="${panelX + 4}" y="${cy - 12}" width="${panelW - 8}" height="${rowH}" fill="transparent" />` +
          `<text x="${panelX + padX}" y="${cy}" fill="#e2e8f0" font-size="11" ` +
          `font-family="'Cascadia Code', 'Fira Code', monospace">${escapeHtml(edgeRows[ri]!)}</text>` +
          `</g>`
        );
      }

      // Envelope row
      const envCy = panelY + headerH + padY + edgeRows.length * rowH + 14;
      parts.push(
        `<g data-layer="conflict">` +
        `<text x="${panelX + padX}" y="${envCy}" fill="#94a3b8" font-size="10" ` +
        `font-family="'Cascadia Code', 'Fira Code', monospace">${escapeHtml(envRow)}</text>` +
        `</g>`
      );

      // ── On-slide: dashed lines connecting overlapping element centers ──
      for (const edge of comp.edges) {
        const ownerDom = snap.dom.elements.find((e) => e.eid === edge.owner_eid);
        const otherDom = snap.dom.elements.find((e) => e.eid === edge.other_eid);
        if (!ownerDom || !otherDom) continue;

        const oCX = ownerDom.bbox.x + ownerDom.bbox.w / 2;
        const oCY = ownerDom.bbox.y + ownerDom.bbox.h / 2;
        const tCX = otherDom.bbox.x + otherDom.bbox.w / 2;
        const tCY = otherDom.bbox.y + otherDom.bbox.h / 2;

        parts.push(
          `<g class="conflict-elem" data-conflict-eid="${escapeHtml(edge.owner_eid)}" data-layer="conflict">` +
          `<line x1="${oCX}" y1="${oCY}" x2="${tCX}" y2="${tCY}" ` +
          `stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" opacity="0.7" />` +
          `</g>`
        );
      }

      // ── On-slide: small directional arrows for free space (envelopes) ──
      for (const env of comp.envelopes) {
        const domEl = snap.dom.elements.find((e) => e.eid === env.eid);
        if (!domEl) continue;
        const b = domEl.bbox;
        const arrowLen = 12;

        parts.push(`<g class="conflict-elem" data-conflict-eid="${escapeHtml(env.eid)}" data-layer="conflict">`);

        // Top arrow
        if (env.free_top > 0) {
          parts.push(
            `<line x1="${b.x + b.w / 2}" y1="${b.y}" x2="${b.x + b.w / 2}" y2="${b.y - Math.min(arrowLen, env.free_top)}" ` +
            `stroke="#22c55e" stroke-width="1.5" />` +
            `<polygon points="${b.x + b.w / 2 - 3},${b.y - Math.min(arrowLen, env.free_top) + 4} ${b.x + b.w / 2 + 3},${b.y - Math.min(arrowLen, env.free_top) + 4} ${b.x + b.w / 2},${b.y - Math.min(arrowLen, env.free_top)}" ` +
            `fill="#22c55e" />`
          );
        }
        // Bottom arrow
        if (env.free_bottom > 0) {
          parts.push(
            `<line x1="${b.x + b.w / 2}" y1="${b.y + b.h}" x2="${b.x + b.w / 2}" y2="${b.y + b.h + Math.min(arrowLen, env.free_bottom)}" ` +
            `stroke="#22c55e" stroke-width="1.5" />` +
            `<polygon points="${b.x + b.w / 2 - 3},${b.y + b.h + Math.min(arrowLen, env.free_bottom) - 4} ${b.x + b.w / 2 + 3},${b.y + b.h + Math.min(arrowLen, env.free_bottom) - 4} ${b.x + b.w / 2},${b.y + b.h + Math.min(arrowLen, env.free_bottom)}" ` +
            `fill="#22c55e" />`
          );
        }
        // Left arrow
        if (env.free_left > 0) {
          parts.push(
            `<line x1="${b.x}" y1="${b.y + b.h / 2}" x2="${b.x - Math.min(arrowLen, env.free_left)}" y2="${b.y + b.h / 2}" ` +
            `stroke="#22c55e" stroke-width="1.5" />` +
            `<polygon points="${b.x - Math.min(arrowLen, env.free_left) + 4},${b.y + b.h / 2 - 3} ${b.x - Math.min(arrowLen, env.free_left) + 4},${b.y + b.h / 2 + 3} ${b.x - Math.min(arrowLen, env.free_left)},${b.y + b.h / 2}" ` +
            `fill="#22c55e" />`
          );
        }
        // Right arrow
        if (env.free_right > 0) {
          parts.push(
            `<line x1="${b.x + b.w}" y1="${b.y + b.h / 2}" x2="${b.x + b.w + Math.min(arrowLen, env.free_right)}" y2="${b.y + b.h / 2}" ` +
            `stroke="#22c55e" stroke-width="1.5" />` +
            `<polygon points="${b.x + b.w + Math.min(arrowLen, env.free_right) - 4},${b.y + b.h / 2 - 3} ${b.x + b.w + Math.min(arrowLen, env.free_right) - 4},${b.y + b.h / 2 + 3} ${b.x + b.w + Math.min(arrowLen, env.free_right)},${b.y + b.h / 2}" ` +
            `fill="#22c55e" />`
          );
        }

        parts.push(`</g>`);
      }
    }
  }

  return defs + parts.join("\n            ");
}

interface SvgRectOpts {
  stroke: string;
  strokeWidth: number;
  fill: string;
  dashArray: string | undefined;
  layer: string;
  eid?: string;
}

function svgRect(rect: Rect, opts: SvgRectOpts): string {
  const eidAttr = opts.eid ? ` data-eid="${escapeHtml(opts.eid)}"` : "";
  const dash = opts.dashArray ? ` stroke-dasharray="${opts.dashArray}"` : "";
  return (
    `<rect data-layer="${opts.layer}"${eidAttr} ` +
    `x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" ` +
    `fill="${opts.fill}" stroke="${opts.stroke}" stroke-width="${opts.strokeWidth}"${dash} ` +
    `pointer-events="all" />`
  );
}

/** Build an element-specific OOB overlay: hatched rect on the overflowing portion + label */
function buildOOBOverlay(
  edge: string, byPx: number,
  slideW: number, slideH: number,
  eid: string, domEl?: DOMElement,
): string {
  const parts: string[] = [];

  if (domEl) {
    // Compute the out-of-bounds portion of this specific element
    const b = domEl.bbox;
    let oobRect: Rect | null = null;
    switch (edge) {
      case "right":  oobRect = { x: slideW, y: b.y, w: byPx, h: b.h }; break;
      case "left":   oobRect = { x: b.x, y: b.y, w: byPx, h: b.h }; break;
      case "bottom": oobRect = { x: b.x, y: slideH, w: b.w, h: byPx }; break;
      case "top":    oobRect = { x: b.x, y: b.y, w: b.w, h: byPx }; break;
    }
    if (oobRect) {
      // Red hatched area for the OOB portion
      parts.push(
        `<rect data-layer="oob" data-eid="${escapeHtml(eid)}" ` +
        `x="${oobRect.x}" y="${oobRect.y}" width="${oobRect.w}" height="${oobRect.h}" ` +
        `fill="rgba(239,68,68,0.2)" stroke="#ef4444" stroke-width="2" stroke-dasharray="4,2" />`
      );
      // Diagonal hatch lines inside the OOB rect
      const step = 12;
      for (let offset = 0; offset < oobRect.w + oobRect.h; offset += step) {
        const lx1 = oobRect.x + Math.min(offset, oobRect.w);
        const ly1 = oobRect.y + Math.max(0, offset - oobRect.w);
        const lx2 = oobRect.x + Math.max(0, offset - oobRect.h);
        const ly2 = oobRect.y + Math.min(offset, oobRect.h);
        parts.push(
          `<line data-layer="oob" x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" ` +
          `stroke="#ef4444" stroke-width="1" opacity="0.4" />`
        );
      }
    }

    // Label: "out of bounds: right +20px"
    const labelText = `out of bounds: ${edge} +${Math.round(byPx)}px`;
    const labelW = labelText.length * 6.5 + 12;
    let labelX: number, labelY: number;
    switch (edge) {
      case "right":  labelX = slideW - labelW - 4; labelY = b.y - 22; break;
      case "left":   labelX = 4; labelY = b.y - 22; break;
      case "bottom": labelX = b.x; labelY = slideH - 22; break;
      case "top":    labelX = b.x; labelY = 4; break;
      default:       labelX = b.x; labelY = b.y - 22;
    }
    parts.push(
      `<g data-layer="oob" data-eid="${escapeHtml(eid)}">` +
      `<rect x="${labelX}" y="${labelY}" width="${labelW}" height="18" rx="3" fill="#ef4444" opacity="0.9" />` +
      `<text x="${labelX + 6}" y="${labelY + 13}" fill="white" font-size="11" font-family="system-ui, sans-serif">${escapeHtml(labelText)}</text>` +
      `</g>`
    );
  } else {
    // Fallback: edge line when element not found
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
    switch (edge) {
      case "left":   x2 = 0; y2 = slideH; break;
      case "right":  x1 = slideW; x2 = slideW; y2 = slideH; break;
      case "top":    x2 = slideW; break;
      case "bottom": y1 = slideH; x2 = slideW; y2 = slideH; break;
    }
    parts.push(
      `<line data-layer="oob" data-eid="${escapeHtml(eid)}" ` +
      `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ef4444" stroke-width="3" />`
    );
  }

  return parts.join("\n            ");
}

function badgeColor(type: string): string {
  switch (type) {
    case "content_overflow": return "#dc2626";
    case "out_of_bounds": return "#dc2626";
    case "overlap": return "#ea580c";
    case "font_too_small": return "#ca8a04";
    default: return "#6b7280";
  }
}

/** Build a human-readable defect label from the defect data */
function defectLabel(d: Defect): string {
  switch (d.type) {
    case "content_overflow": {
      const det = d.details as { overflow_x_px: number; overflow_y_px: number };
      const parts: string[] = [];
      if (det.overflow_x_px > 0) parts.push(`\u2194${Math.round(det.overflow_x_px)}px`);
      if (det.overflow_y_px > 0) parts.push(`\u2195${Math.round(det.overflow_y_px)}px`);
      return `overflow ${parts.join(" ")}`;
    }
    case "out_of_bounds": {
      const det = d.details as { edge: string; by_px: number };
      return `out of bounds: ${det.edge} +${Math.round(det.by_px)}px`;
    }
    case "overlap": {
      const det = d.details as { overlap_area_px: number; severity_note?: string };
      const other = d.other_eid ? ` vs ${d.other_eid}` : "";
      return `overlap${other} ${Math.round(det.overlap_area_px)}px\u00B2`;
    }
    case "font_too_small": {
      const det = d.details as { current: number; min: number };
      return `font ${det.current}px < ${det.min}px min`;
    }
    default:
      return d.type;
  }
}

const CSS_CONTENT = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e1e2e; color: #cdd6f4; }
#app { display: flex; flex-direction: column; height: 100vh; }

#toolbar {
  background: #181825;
  border-bottom: 1px solid #313244;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
#toolbar h1 { font-size: 16px; color: #cba6f7; white-space: nowrap; }
#tabs { display: flex; gap: 4px; }
.tab {
  background: #313244;
  border: 1px solid #45475a;
  color: #cdd6f4;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tab:hover { background: #45475a; }
.tab.active { background: #585b70; border-color: #cba6f7; }
.tab-badge {
  font-size: 10px;
  background: #45475a;
  padding: 1px 5px;
  border-radius: 3px;
}
.tab.active .tab-badge { background: #6c7086; }

#toggles {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-left: auto;
  font-size: 12px;
}
#toggles label { display: flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap; }
.swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 2px;
  vertical-align: middle;
}

#main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

#slide-area {
  flex: 1;
  overflow: auto;
  padding: 24px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  position: relative;
}

#slide-container {
  position: relative;
  flex-shrink: 0;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  border-radius: 4px;
  overflow: visible;
}

.iter-slide { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.slide-base { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.slide-base > div { position: relative; }
.overlay-svg {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 10000;
}
.overlay-svg rect, .overlay-svg line, .overlay-svg circle, .overlay-svg text, .overlay-svg path, .overlay-svg polygon { pointer-events: all; }

#tooltip {
  display: none;
  position: fixed;
  background: #181825;
  border: 1px solid #585b70;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  max-width: 280px;
  z-index: 99999;
  line-height: 1.5;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
#tooltip hr { border: none; border-top: 1px solid #45475a; margin: 4px 0; }
.tip-defect { color: #f38ba8; font-weight: 600; }

#panel {
  width: 360px;
  background: #181825;
  border-left: 1px solid #313244;
  display: flex;
  flex-direction: column;
  transition: width 0.2s;
  overflow: hidden;
}
#panel.collapsed { width: 0; min-width: 0; border-left: none; }
#panel-header {
  padding: 8px;
  border-bottom: 1px solid #313244;
  display: flex;
  align-items: center;
  gap: 4px;
}
#panel-tabs { display: flex; gap: 2px; flex: 1; }
.panel-tab {
  background: #313244;
  border: 1px solid #45475a;
  color: #cdd6f4;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.panel-tab:hover { background: #45475a; }
.panel-tab.active { background: #585b70; border-color: #cba6f7; }
#panel-header > button {
  background: #313244;
  border: 1px solid #45475a;
  color: #cdd6f4;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
#panel-header > button:hover { background: #45475a; }
#panel-content {
  flex: 1;
  overflow: auto;
  padding: 12px;
  font-size: 11px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
  color: #a6adc8;
}

/* ── Timeline ── */
#timeline {
  background: #181825;
  border-bottom: 1px solid #313244;
  padding: 6px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
#timeline-controls { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }
#timeline-controls button {
  background: #313244;
  border: 1px solid #45475a;
  color: #cdd6f4;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
#timeline-controls button:hover { background: #45475a; }
#speed-select {
  background: #313244;
  border: 1px solid #45475a;
  color: #cdd6f4;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 11px;
}
#timeline-track {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  min-height: 28px;
}
#timeline-progress {
  position: absolute;
  left: 0;
  top: 50%;
  height: 3px;
  background: #cba6f7;
  border-radius: 2px;
  transition: width 0.3s ease;
  width: 0;
  z-index: 0;
}
.timeline-marker {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 11px;
  color: #6c7086;
  position: relative;
  z-index: 1;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.15s;
}
.timeline-marker:hover { background: #313244; }
.timeline-marker.active { color: #cba6f7; font-weight: 600; }
.marker-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #45475a;
  flex-shrink: 0;
}
.timeline-marker.active .marker-dot { background: #cba6f7; }
.marker-badge {
  font-size: 9px;
  background: #313244;
  padding: 0 4px;
  border-radius: 3px;
}
/* Taboo marker styling */
.timeline-marker.taboo .marker-dot { background: #ef4444; }
.timeline-marker.taboo .marker-label { text-decoration: line-through; color: #ef4444; }

/* ── Animation layer ── */
#anim-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  pointer-events: none;
  display: none;
}
.anim-rect { position: absolute; }

/* Hover-to-highlight: conflict elements on slide */
.conflict-elem { opacity: 0.2; transition: opacity 0.15s ease; }
.conflict-elem.active, .conflict-elem:hover { opacity: 1; }

/* Hover-to-highlight: conflict panel rows */
.conflict-panel-row { opacity: 0.6; transition: opacity 0.15s ease; }
.conflict-panel-row.active, .conflict-panel-row:hover { opacity: 1; }

/* Hover-to-highlight: defect labels */
.defect-group { opacity: 0.25; transition: opacity 0.15s ease; }
.defect-group.active, .defect-group:hover { opacity: 1; }

/* Ensure all SVG children are hoverable */
.conflict-elem *, .conflict-panel-row *, .defect-group * { pointer-events: all; }

/* Animated marching-ants trace for movement arrows */
@keyframes marchingAnts { to { stroke-dashoffset: -16; } }
.move-trace { stroke-dasharray: 10 6; animation: marchingAnts 0.5s linear infinite; }
`;
