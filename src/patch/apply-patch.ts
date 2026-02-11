import type { IRDocument, IRElement } from "../schema/ir.js";
import type { PatchDocument } from "../schema/patch.js";
import type { Override } from "../schema/trace.js";
import {
  HIGH_PRIO_SIZE_BUDGET,
  HIGH_PRIO_MOVE_PX,
  SLIDE_W,
  SLIDE_H,
  MIN_FONT_BY_PRIORITY,
} from "../constants.js";

/** Size properties subject to ratio-based budget */
const SIZE_PROPS_LAYOUT = ["w", "h"] as const;
const SIZE_PROPS_STYLE = ["fontSize", "lineHeight"] as const;

/** Position properties subject to absolute-based budget */
const POSITION_PROPS = ["x", "y"] as const;

export interface ApplyPatchResult {
  ir: IRDocument;
  overrides: Override[];
}

function getMinFont(priority: number): number | undefined {
  // Find the matching tier
  for (const [tierPriority, minFont] of MIN_FONT_BY_PRIORITY) {
    if (priority >= tierPriority) return minFont;
  }
  return undefined;
}

function clampSize(
  current: number,
  requested: number,
  field: string,
  eid: string,
  overrides: Override[]
): number {
  const minAllowed = current * (1 - HIGH_PRIO_SIZE_BUDGET);
  const maxAllowed = current * (1 + HIGH_PRIO_SIZE_BUDGET);
  if (requested < minAllowed) {
    const clamped = Math.round(minAllowed * 100) / 100;
    overrides.push({
      eid,
      field,
      requested,
      clamped_to: clamped,
      reason: `HIGH_PRIO_SIZE_BUDGET exceeded (max ${HIGH_PRIO_SIZE_BUDGET * 100}% change from current ${current})`,
    });
    return clamped;
  }
  if (requested > maxAllowed) {
    const clamped = Math.round(maxAllowed * 100) / 100;
    overrides.push({
      eid,
      field,
      requested,
      clamped_to: clamped,
      reason: `HIGH_PRIO_SIZE_BUDGET exceeded (max ${HIGH_PRIO_SIZE_BUDGET * 100}% change from current ${current})`,
    });
    return clamped;
  }
  return requested;
}

function clampPosition(
  current: number,
  requested: number,
  field: string,
  eid: string,
  overrides: Override[]
): number {
  const delta = requested - current;
  if (Math.abs(delta) > HIGH_PRIO_MOVE_PX) {
    const clamped = current + Math.sign(delta) * HIGH_PRIO_MOVE_PX;
    overrides.push({
      eid,
      field,
      requested,
      clamped_to: clamped,
      reason: `HIGH_PRIO_MOVE_PX exceeded (max ${HIGH_PRIO_MOVE_PX}px from current ${current})`,
    });
    return clamped;
  }
  return requested;
}

/**
 * Apply a patch to an IR document.
 * Enforces dual budget for priority >= 80 elements and clamps to slide bounds.
 */
export function applyPatch(
  currentIR: IRDocument,
  patch: PatchDocument
): ApplyPatchResult {
  const overrides: Override[] = [];

  // Deep clone the IR
  const ir: IRDocument = JSON.parse(JSON.stringify(currentIR));

  // Build eid -> element index map
  const eidMap = new Map<string, number>();
  for (let i = 0; i < ir.elements.length; i++) {
    const el = ir.elements[i]!;
    eidMap.set(el.eid, i);
  }

  for (const edit of patch.edits) {
    const idx = eidMap.get(edit.eid);
    if (idx == null) continue;
    const el = ir.elements[idx]!;
    const isHighPrio = el.priority >= 80;

    // Merge layout
    if (edit.layout) {
      for (const prop of POSITION_PROPS) {
        const val = edit.layout[prop];
        if (val != null) {
          const current = el.layout[prop];
          el.layout[prop] = isHighPrio
            ? clampPosition(current, val, `layout.${prop}`, el.eid, overrides)
            : val;
        }
      }
      for (const prop of SIZE_PROPS_LAYOUT) {
        const val = edit.layout[prop];
        if (val != null) {
          const current = el.layout[prop];
          el.layout[prop] = isHighPrio
            ? clampSize(current, val, `layout.${prop}`, el.eid, overrides)
            : val;
        }
      }
      if (edit.layout.zIndex != null) {
        el.layout.zIndex = edit.layout.zIndex;
      }
    }

    // Merge style
    if (edit.style) {
      for (const prop of SIZE_PROPS_STYLE) {
        const val = edit.style[prop];
        if (val != null) {
          const current = el.style[prop];
          if (current != null && isHighPrio) {
            (el.style as Record<string, unknown>)[prop] = clampSize(
              current,
              val,
              `style.${prop}`,
              el.eid,
              overrides
            );
          } else {
            (el.style as Record<string, unknown>)[prop] = val;
          }
        }
      }
      // Copy other style properties directly
      for (const [key, val] of Object.entries(edit.style)) {
        if (
          key !== "fontSize" &&
          key !== "lineHeight" &&
          val != null
        ) {
          (el.style as Record<string, unknown>)[key] = val;
        }
      }
    }

    // Enforce min font
    if (el.style.fontSize != null) {
      const minFont = getMinFont(el.priority);
      if (minFont != null && el.style.fontSize < minFont) {
        el.style.fontSize = minFont;
      }
    }

    // Clamp layout to slide bounds
    el.layout.x = Math.max(0, el.layout.x);
    el.layout.y = Math.max(0, el.layout.y);
    if (el.layout.x + el.layout.w > SLIDE_W) {
      el.layout.w = SLIDE_W - el.layout.x;
    }
    if (el.layout.y + el.layout.h > SLIDE_H) {
      el.layout.h = SLIDE_H - el.layout.y;
    }
  }

  return { ir, overrides };
}
