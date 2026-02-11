#!/usr/bin/env python3
"""
Tool B: Post-processing visual debug — overlay bounding boxes on rendered slides.

Usage:
  # Single image with diagnostics
  python visual_debug.py dom_0.json render_0.png --diag diag_0.json -o debug_0.png

  # Single image, only bbox + contentBox (no safeBox)
  python visual_debug.py dom_0.json render_0.png --layers bbox contentBox

  # Batch: process an entire rollout directory
  python visual_debug.py --batch rollouts/rollout_0042/

Requires: pip install Pillow
"""

import argparse
import json
import math
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow", file=sys.stderr)
    sys.exit(1)

# ── Colors (RGBA) ──

BBOX_COLOR = (34, 197, 94, 255)          # green  #22c55e
SAFEBOX_COLOR = (249, 115, 22, 255)      # orange #f97316
CONTENTBOX_COLOR = (236, 72, 153, 255)   # pink   #ec4899
OVERFLOW_COLOR = (239, 68, 68, 255)      # red    #ef4444
OVERLAP_COLOR = (234, 179, 8, 180)       # yellow #eab308 semi-transparent
OOB_COLOR = (239, 68, 68, 255)           # red    #ef4444
SUMMARY_BG = (0, 0, 0, 190)             # dark semi-transparent
SUMMARY_FG = (255, 255, 255, 255)


# ── Drawing helpers ──

def draw_dashed_line(draw, start, end, fill, width=1, dash=(6, 4)):
    """Draw a dashed line segment."""
    x1, y1 = start
    x2, y2 = end
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length < 1:
        return
    ux, uy = dx / length, dy / length
    on_len, off_len = dash
    pos = 0.0
    drawing = True
    while pos < length:
        seg = on_len if drawing else off_len
        end_pos = min(pos + seg, length)
        if drawing:
            sx = x1 + ux * pos
            sy = y1 + uy * pos
            ex = x1 + ux * end_pos
            ey = y1 + uy * end_pos
            draw.line([(sx, sy), (ex, ey)], fill=fill, width=width)
        pos = end_pos
        drawing = not drawing


def draw_solid_rect(draw, x, y, w, h, outline, width=1):
    """Draw a solid-outline rectangle."""
    draw.rectangle([x, y, x + w, y + h], outline=outline, width=width)


def draw_dashed_rect(draw, x, y, w, h, fill, width=1, dash=(6, 4)):
    """Draw a dashed-outline rectangle."""
    corners = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
    for i in range(4):
        draw_dashed_line(draw, corners[i], corners[(i + 1) % 4], fill, width, dash)


def draw_filled_rect(draw, x, y, w, h, fill):
    """Draw a filled rectangle (no outline)."""
    draw.rectangle([x, y, x + w, y + h], fill=fill)


def get_font(size=11):
    """Try to load a monospace font, fall back to default."""
    for name in ["consola.ttf", "Consolas.ttf", "DejaVuSansMono.ttf",
                  "LiberationMono-Regular.ttf", "courier.ttf"]:
        try:
            return ImageFont.truetype(name, size)
        except (OSError, IOError):
            pass
    # Pillow 10+ supports load_default(size=...)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def intersect_rects(a, b):
    """Compute intersection of two {x,y,w,h} dicts, or None."""
    x = max(a["x"], b["x"])
    y = max(a["y"], b["y"])
    right = min(a["x"] + a["w"], b["x"] + b["w"])
    bottom = min(a["y"] + a["h"], b["y"] + b["h"])
    w = right - x
    h = bottom - y
    if w <= 0 or h <= 0:
        return None
    return {"x": x, "y": y, "w": w, "h": h}


# ── Core rendering ──

def render_debug(dom, render_path, diag=None, layers=None, output_path=None):
    """
    Overlay bounding boxes on a rendered slide screenshot.

    Args:
        dom: parsed dom JSON (dict with 'slide' and 'elements')
        render_path: path to render PNG
        diag: optional parsed diag JSON
        layers: list of layer names to draw (default: all three)
        output_path: output path (default: debug_N.png next to render)
    """
    if layers is None:
        layers = ["bbox", "safeBox", "contentBox"]

    base = Image.open(render_path).convert("RGBA")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = get_font(11)
    font_small = get_font(9)

    # ── Draw box layers per element ──
    for el in dom["elements"]:
        eid = el["eid"]
        bbox = el["bbox"]
        safe = el["safeBox"]
        content = el.get("contentBox")

        has_overflow = False
        if diag:
            has_overflow = any(
                d["type"] == "content_overflow"
                and (d.get("eid") == eid or d.get("owner_eid") == eid)
                for d in diag.get("defects", [])
            )

        # bbox — green solid
        if "bbox" in layers:
            draw_solid_rect(draw, bbox["x"], bbox["y"], bbox["w"], bbox["h"],
                            outline=BBOX_COLOR, width=1)

        # safeBox — orange dashed
        if "safeBox" in layers:
            draw_dashed_rect(draw, safe["x"], safe["y"], safe["w"], safe["h"],
                             fill=SAFEBOX_COLOR, width=1, dash=(6, 3))

        # contentBox — pink dotted (red if overflow)
        if "contentBox" in layers and content:
            color = OVERFLOW_COLOR if has_overflow else CONTENTBOX_COLOR
            width = 2 if has_overflow else 1
            draw_dashed_rect(draw, content["x"], content["y"],
                             content["w"], content["h"],
                             fill=color, width=width, dash=(3, 2))

        # EID label
        if "bbox" in layers:
            draw.text((bbox["x"] + 2, bbox["y"] - 12), eid,
                      fill=BBOX_COLOR, font=font_small)

    # ── Defect annotations (when diag provided) ──
    if diag:
        elements_by_eid = {el["eid"]: el for el in dom["elements"]}

        for defect in diag.get("defects", []):
            dtype = defect["type"]

            # Overlap zones — yellow fill
            if dtype == "overlap":
                owner = elements_by_eid.get(defect.get("owner_eid"))
                other = elements_by_eid.get(defect.get("other_eid"))
                if owner and other:
                    inter = intersect_rects(owner["safeBox"], other["safeBox"])
                    if inter:
                        draw_filled_rect(draw, inter["x"], inter["y"],
                                         inter["w"], inter["h"], fill=OVERLAP_COLOR)

            # Content overflow — red tint
            if dtype == "content_overflow":
                eid = defect.get("eid") or defect.get("owner_eid")
                el = elements_by_eid.get(eid)
                if el:
                    b = el["bbox"]
                    draw_filled_rect(draw, b["x"], b["y"], b["w"], b["h"],
                                     fill=(239, 68, 68, 30))

            # OOB — red edge line
            if dtype == "out_of_bounds":
                edge = defect["details"]["edge"]
                sw, sh = dom["slide"]["w"], dom["slide"]["h"]
                if edge == "left":
                    draw.line([(0, 0), (0, sh)], fill=OOB_COLOR, width=3)
                elif edge == "right":
                    draw.line([(sw - 1, 0), (sw - 1, sh)], fill=OOB_COLOR, width=3)
                elif edge == "top":
                    draw.line([(0, 0), (sw, 0)], fill=OOB_COLOR, width=3)
                elif edge == "bottom":
                    draw.line([(0, sh - 1), (sw, sh - 1)], fill=OOB_COLOR, width=3)

        # ── Summary box (top-left) ──
        summary = diag.get("summary", {})
        lines = [
            f"Defects: {summary.get('defect_count', '?')}  "
            f"Severity: {summary.get('total_severity', '?')}  "
            f"Warnings: {summary.get('warning_count', '?')}",
        ]
        chain = summary.get("conflict_chain")
        if chain:
            lines.append(f"Chain: {' → '.join(chain)}  "
                         f"(feasible: {summary.get('chain_feasible', '?')})")

        line_h = 16
        pad = 8
        box_w = max(len(l) for l in lines) * 7 + pad * 2
        box_h = len(lines) * line_h + pad * 2
        draw_filled_rect(draw, 4, 4, box_w, box_h, fill=SUMMARY_BG)
        for i, line in enumerate(lines):
            draw.text((4 + pad, 4 + pad + i * line_h), line,
                      fill=SUMMARY_FG, font=font)

    # ── Composite and save ──
    result = Image.alpha_composite(base, overlay)

    if output_path is None:
        # Derive from render path: render_0.png → debug_0.png
        rp = Path(render_path)
        output_path = rp.parent / rp.name.replace("render_", "debug_")

    result.save(str(output_path))
    print(f"  wrote {output_path}")
    return output_path


def run_batch(rollout_dir, layers=None):
    """Process an entire rollout directory."""
    rollout = Path(rollout_dir)
    if not rollout.is_dir():
        print(f"Error: {rollout} is not a directory", file=sys.stderr)
        sys.exit(1)

    # Find all dom_N.json files and match with render_N.png
    dom_files = sorted(rollout.glob("dom_*.json"))
    if not dom_files:
        print(f"No dom_*.json files found in {rollout}", file=sys.stderr)
        sys.exit(1)

    print(f"Batch processing {rollout} ({len(dom_files)} iterations)")

    for dom_path in dom_files:
        # Extract iteration number: dom_0.json → 0
        match = re.search(r"dom_(\d+)\.json$", dom_path.name)
        if not match:
            continue
        n = match.group(1)

        render_path = rollout / f"render_{n}.png"
        diag_path = rollout / f"diag_{n}.json"
        output_path = rollout / f"debug_{n}.png"

        if not render_path.exists():
            print(f"  skip iter {n}: {render_path.name} not found")
            continue

        print(f"  iter {n}:", end="")
        with open(dom_path) as f:
            dom = json.load(f)

        diag = None
        if diag_path.exists():
            with open(diag_path) as f:
                diag = json.load(f)
            print(f" +diag", end="")

        render_debug(dom, str(render_path), diag=diag, layers=layers,
                     output_path=output_path)


def main():
    parser = argparse.ArgumentParser(
        description="Overlay debug bounding boxes on rendered slide screenshots.",
        epilog="Examples:\n"
               "  python visual_debug.py dom_0.json render_0.png\n"
               "  python visual_debug.py dom_0.json render_0.png --diag diag_0.json -o debug_0.png\n"
               "  python visual_debug.py dom_0.json render_0.png --layers bbox contentBox\n"
               "  python visual_debug.py --batch rollouts/rollout_0042/\n",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument("dom_json", nargs="?", help="Path to dom_N.json")
    parser.add_argument("render_png", nargs="?", help="Path to render_N.png")
    parser.add_argument("--diag", help="Path to diag_N.json (optional)")
    parser.add_argument("-o", "--output", help="Output path (default: debug_N.png)")
    parser.add_argument("--layers", nargs="+",
                        choices=["bbox", "safeBox", "contentBox"],
                        default=["bbox", "safeBox", "contentBox"],
                        help="Which layers to draw (default: all)")
    parser.add_argument("--batch", metavar="DIR",
                        help="Process entire rollout directory")

    args = parser.parse_args()

    if args.batch:
        run_batch(args.batch, layers=args.layers)
        return

    if not args.dom_json or not args.render_png:
        parser.error("dom_json and render_png are required (or use --batch)")

    with open(args.dom_json) as f:
        dom = json.load(f)

    diag = None
    if args.diag:
        with open(args.diag) as f:
            diag = json.load(f)

    render_debug(dom, args.render_png, diag=diag, layers=args.layers,
                 output_path=args.output)


if __name__ == "__main__":
    main()
