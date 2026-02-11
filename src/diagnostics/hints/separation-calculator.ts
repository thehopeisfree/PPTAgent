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
  // Move down: owner.bbox.y needs to be at other.safeBox.y + other.safeBox.h - SAFE_PADDING
  const moveDownTarget = other.safeBox.y + other.safeBox.h - SAFE_PADDING;
  const moveDownCost = Math.abs(moveDownTarget - owner.bbox.y);

  // Move up: owner bottom safeBox edge clears above other top safeBox edge
  const moveUpTarget = other.bbox.y - owner.bbox.h - SAFE_PADDING * 2;
  const moveUpCost = Math.abs(owner.bbox.y - moveUpTarget);

  // Move right: owner.bbox.x needs to be at other.safeBox.x + other.safeBox.w - SAFE_PADDING
  const moveRightTarget = other.safeBox.x + other.safeBox.w - SAFE_PADDING;
  const moveRightCost = Math.abs(moveRightTarget - owner.bbox.x);

  // Move left: owner right safeBox edge clears left of other left safeBox edge
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
