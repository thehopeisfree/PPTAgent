import type { DOMElement } from "../../schema/dom.js";
import type { SeparationOption } from "../../schema/diag.js";
import { SAFE_PADDING } from "../../constants.js";

/**
 * Compute all 4 separation options (up/down/left/right) for moving the
 * owner element to clear the other element's safeBox.
 *
 * Returns options sorted by cost ascending (cheapest move first).
 */
export function computeSeparationOptions(
  owner: DOMElement,
  other: DOMElement,
): SeparationOption[] {
  // Move down: owner's safeBox top must clear other's safeBox bottom
  // owner.safeBox.y = owner.bbox.y - SAFE_PADDING, so:
  // owner.bbox.y - SAFE_PADDING >= other.safeBox.y + other.safeBox.h
  // owner.bbox.y >= other.bbox.y + other.bbox.h + SAFE_PADDING * 2
  const moveDownTarget = other.bbox.y + other.bbox.h + SAFE_PADDING * 2;
  const moveDownCost = Math.abs(moveDownTarget - owner.bbox.y);

  // Move up: owner's safeBox bottom must clear above other's safeBox top
  // owner.bbox.y + owner.bbox.h + SAFE_PADDING <= other.bbox.y - SAFE_PADDING
  const moveUpTarget = other.bbox.y - owner.bbox.h - SAFE_PADDING * 2;
  const moveUpCost = Math.abs(owner.bbox.y - moveUpTarget);

  // Move right: owner's safeBox left must clear other's safeBox right
  const moveRightTarget = other.bbox.x + other.bbox.w + SAFE_PADDING * 2;
  const moveRightCost = Math.abs(moveRightTarget - owner.bbox.x);

  // Move left: owner's safeBox right must clear other's safeBox left
  const moveLeftTarget = other.bbox.x - owner.bbox.w - SAFE_PADDING * 2;
  const moveLeftCost = Math.abs(owner.bbox.x - moveLeftTarget);

  const options: SeparationOption[] = [
    {
      direction: "move_down",
      target_y: Math.round(moveDownTarget),
      cost_px: Math.round(moveDownCost),
    },
    {
      direction: "move_up",
      target_y: Math.round(moveUpTarget),
      cost_px: Math.round(moveUpCost),
    },
    {
      direction: "move_right",
      target_x: Math.round(moveRightTarget),
      cost_px: Math.round(moveRightCost),
    },
    {
      direction: "move_left",
      target_x: Math.round(moveLeftTarget),
      cost_px: Math.round(moveLeftCost),
    },
  ];

  options.sort((a, b) => a.cost_px - b.cost_px);
  return options;
}
