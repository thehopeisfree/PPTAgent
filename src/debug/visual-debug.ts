import type { IRDocument, IRElement } from "../schema/ir.js";
import type { DOMDocument, DOMElement, Rect } from "../schema/dom.js";
import type { DiagDocument, Defect, Warning } from "../schema/diag.js";
import type { Override } from "../schema/trace.js";
import { renderHTML } from "../renderer/html-renderer.js";
import { intersectRects } from "../utils/geometry.js";
import { SLIDE_W, SLIDE_H } from "../constants.js";

export interface DebugSnapshot {
  iter: number;
  ir: IRDocument;
  dom: DOMDocument;
  diag: DiagDocument;
  overrides?: Override[];
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
  const iterData = snapshots.map((snap) => ({
    iter: snap.iter,
    slideHTML: extractSlideDiv(renderHTML(snap.ir)),
    overlays: buildOverlaySVG(snap, slideW, slideH),
    diagJSON: JSON.stringify(snap.diag, null, 2),
    overridesJSON: snap.overrides
      ? JSON.stringify(snap.overrides, null, 2)
      : null,
    elements: buildElementData(snap),
    summary: snap.diag.summary,
  }));

  const iterDataJSON = escapeForScript(JSON.stringify(iterData.map((d) => ({
    iter: d.iter,
    diagJSON: d.diagJSON,
    overridesJSON: d.overridesJSON,
    elements: d.elements,
    summary: d.summary,
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
      <label><input type="checkbox" checked data-layer="bbox" onchange="toggleLayer('bbox', this.checked)"> <span class="swatch" style="border:2px solid #3b82f6"></span> bbox</label>
      <label><input type="checkbox" checked data-layer="safebox" onchange="toggleLayer('safebox', this.checked)"> <span class="swatch" style="border:2px dashed #8b5cf6"></span> safeBox</label>
      <label><input type="checkbox" checked data-layer="contentbox" onchange="toggleLayer('contentbox', this.checked)"> <span class="swatch" style="border:2px dotted #22c55e"></span> contentBox</label>
      <label><input type="checkbox" checked data-layer="overlap" onchange="toggleLayer('overlap', this.checked)"> <span class="swatch" style="background:rgba(239,68,68,0.25)"></span> overlaps</label>
      <label><input type="checkbox" checked data-layer="oob" onchange="toggleLayer('oob', this.checked)"> <span class="swatch" style="border:2px solid #ef4444"></span> OOB</label>
      <label><input type="checkbox" checked data-layer="badge" onchange="toggleLayer('badge', this.checked)"> <span class="swatch" style="background:#ef4444;color:#fff;font-size:9px;padding:0 2px">D</span> badges</label>
      <label><input type="checkbox" checked data-layer="hint" onchange="toggleLayer('hint', this.checked)"> <span class="swatch" style="border:2px dashed #22c55e"></span> hints</label>
      <label><input type="checkbox" checked data-layer="chain" onchange="toggleLayer('chain', this.checked)"> <span class="swatch" style="border:2px solid #f59e0b"></span> chains</label>
    </div>
  </div>
  <div id="main">
    <div id="slide-area">
      <div id="slide-container" style="width:${slideW}px;height:${slideH}px;">
        ${iterData.map((d, i) => `<div class="iter-slide" data-iter="${i}" style="display:${i === 0 ? "block" : "none"}">
          <div class="slide-base">${d.slideHTML}</div>
          <svg class="overlay-svg" width="${slideW}" height="${slideH}" viewBox="0 0 ${slideW} ${slideH}">
            ${d.overlays}
          </svg>
        </div>`).join("\n        ")}
      </div>
      <div id="tooltip"></div>
    </div>
    <div id="panel">
      <div id="panel-header">
        <button onclick="togglePanel()">Diagnostics JSON</button>
      </div>
      <pre id="panel-content">${escapeHtml(iterData[0]!.diagJSON)}</pre>
    </div>
  </div>
</div>
<script>
var iterDataMeta = ${iterDataJSON};
var currentIter = 0;

function switchIter(idx) {
  currentIter = idx;
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab')[idx].classList.add('active');
  document.querySelectorAll('.iter-slide').forEach(function(s) {
    s.style.display = s.dataset.iter == idx ? 'block' : 'none';
  });
  document.getElementById('panel-content').textContent = iterDataMeta[idx].diagJSON;
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

// Tooltip on hover
document.addEventListener('mouseover', function(e) {
  var target = e.target;
  while (target && !target.dataset?.eid && target.id !== 'app') {
    target = target.parentElement;
  }
  if (!target || !target.dataset?.eid) {
    document.getElementById('tooltip').style.display = 'none';
    return;
  }
  var eid = target.dataset.eid;
  var meta = iterDataMeta[currentIter];
  var elem = meta.elements.find(function(el) { return el.eid === eid; });
  if (!elem) return;
  var tip = document.getElementById('tooltip');
  var lines = ['<b>' + eid + '</b>', 'type: ' + elem.type, 'priority: ' + elem.priority];
  if (elem.defects.length > 0) {
    lines.push('<hr>');
    elem.defects.forEach(function(d) { lines.push('<span class="tip-defect">' + d.type + '</span> sev=' + d.severity); });
  }
  tip.innerHTML = lines.join('<br>');
  tip.style.display = 'block';
  var rect = target.getBoundingClientRect();
  tip.style.left = (rect.right + 8) + 'px';
  tip.style.top = rect.top + 'px';
});

document.addEventListener('mouseout', function(e) {
  var related = e.relatedTarget;
  while (related && !related.dataset?.eid && related.id !== 'app') {
    related = related.parentElement;
  }
  if (!related || !related.dataset?.eid) {
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
    };
  });
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

  // OOB edges
  for (const defect of snap.diag.defects) {
    if (defect.type !== "out_of_bounds") continue;
    const details = defect.details as { edge: string; by_px: number };
    const eid = defect.eid ?? defect.owner_eid ?? "";
    parts.push(buildOOBLine(details.edge, slideW, slideH, eid));
  }

  // Defect badges
  for (const domEl of snap.dom.elements) {
    const defects = snap.diag.defects.filter(
      (d) => d.eid === domEl.eid || d.owner_eid === domEl.eid
    );
    if (defects.length === 0) continue;
    const badgeX = domEl.bbox.x + domEl.bbox.w - 4;
    const badgeY = domEl.bbox.y - 2;
    for (let i = 0; i < defects.length; i++) {
      const d = defects[i]!;
      const color = badgeColor(d.type);
      const label = badgeLabel(d.type);
      const yOff = badgeY + i * 18;
      parts.push(
        `<g data-layer="badge" data-eid="${escapeHtml(domEl.eid)}">` +
        `<rect x="${badgeX}" y="${yOff}" width="${label.length * 7 + 8}" height="16" rx="3" fill="${color}" />` +
        `<text x="${badgeX + 4}" y="${yOff + 12}" fill="white" font-size="10" font-family="monospace">${label}</text>` +
        `</g>`
      );
    }
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

  // Conflict chain arrows
  const chain = snap.diag.summary.conflict_chain;
  if (chain && chain.length > 1) {
    for (let i = 0; i < chain.length - 1; i++) {
      const fromEl = snap.dom.elements.find((e) => e.eid === chain[i]);
      const toEl = snap.dom.elements.find((e) => e.eid === chain[i + 1]);
      if (fromEl && toEl) {
        const x1 = fromEl.bbox.x + fromEl.bbox.w / 2;
        const y1 = fromEl.bbox.y + fromEl.bbox.h / 2;
        const x2 = toEl.bbox.x + toEl.bbox.w / 2;
        const y2 = toEl.bbox.y + toEl.bbox.h / 2;
        parts.push(
          `<line data-layer="chain" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
          `stroke="#f59e0b" stroke-width="2" marker-end="url(#arrowhead)" />`
        );
      }
    }
  }

  // Add arrowhead marker definition if chains exist
  let defs = "";
  if (chain && chain.length > 1) {
    defs = `<defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" /></marker></defs>`;
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

function buildOOBLine(edge: string, slideW: number, slideH: number, eid: string): string {
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
  switch (edge) {
    case "left":   x1 = 0; y1 = 0; x2 = 0; y2 = slideH; break;
    case "right":  x1 = slideW; y1 = 0; x2 = slideW; y2 = slideH; break;
    case "top":    x1 = 0; y1 = 0; x2 = slideW; y2 = 0; break;
    case "bottom": x1 = 0; y1 = slideH; x2 = slideW; y2 = slideH; break;
  }
  return (
    `<line data-layer="oob" data-eid="${escapeHtml(eid)}" ` +
    `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
    `stroke="#ef4444" stroke-width="3" />`
  );
}

function badgeColor(type: string): string {
  switch (type) {
    case "content_overflow": return "#ef4444";
    case "out_of_bounds": return "#ef4444";
    case "overlap": return "#f97316";
    case "font_too_small": return "#eab308";
    default: return "#6b7280";
  }
}

function badgeLabel(type: string): string {
  switch (type) {
    case "content_overflow": return "OVF";
    case "out_of_bounds": return "OOB";
    case "overlap": return "OVL";
    case "font_too_small": return "FNT";
    default: return type.slice(0, 3).toUpperCase();
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
.overlay-svg rect, .overlay-svg line { pointer-events: all; }

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
}
#panel-header button {
  background: #313244;
  border: 1px solid #45475a;
  color: #cdd6f4;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  width: 100%;
}
#panel-header button:hover { background: #45475a; }
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
`;
