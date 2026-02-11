import type { Hint } from "../../schema/diag.js";
import { SLIDE_W, SLIDE_H } from "../../constants.js";

/**
 * Validate and clamp a hint to ensure it produces a valid target state:
 * - Non-negative sizes
 * - Within slide bounds
 */
export function validateHint(hint: Hint): Hint {
  const validated = { ...hint };

  if (validated.suggested_x != null) {
    validated.suggested_x = Math.max(0, validated.suggested_x);
  }
  if (validated.suggested_y != null) {
    validated.suggested_y = Math.max(0, validated.suggested_y);
  }
  if (validated.suggested_w != null) {
    validated.suggested_w = Math.max(1, Math.min(validated.suggested_w, SLIDE_W));
  }
  if (validated.suggested_h != null) {
    validated.suggested_h = Math.max(1, Math.min(validated.suggested_h, SLIDE_H));
  }
  if (validated.suggested_fontSize != null) {
    validated.suggested_fontSize = Math.max(1, validated.suggested_fontSize);
  }

  // Ensure x + w and y + h don't exceed slide bounds
  if (validated.suggested_x != null && validated.suggested_w != null) {
    if (validated.suggested_x + validated.suggested_w > SLIDE_W) {
      validated.suggested_w = SLIDE_W - validated.suggested_x;
    }
  }
  if (validated.suggested_y != null && validated.suggested_h != null) {
    if (validated.suggested_y + validated.suggested_h > SLIDE_H) {
      validated.suggested_h = SLIDE_H - validated.suggested_y;
    }
  }

  validated.validated = true;
  return validated;
}
