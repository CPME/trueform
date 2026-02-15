import type { BooleanOp, ID, Selector } from "../ir.js";
import { booleanOp } from "./geometry.js";

export { booleanOp } from "./geometry.js";

/** Compatibility alias for booleanOp(id, "union", ...). */
export const union = (
  id: ID,
  left: Selector,
  right: Selector,
  result?: string,
  deps?: ID[]
): BooleanOp => booleanOp(id, "union", left, right, result, deps);

/** Compatibility alias for booleanOp(id, "subtract", ...). */
export const cut = (
  id: ID,
  left: Selector,
  right: Selector,
  result?: string,
  deps?: ID[]
): BooleanOp => booleanOp(id, "subtract", left, right, result, deps);

/** Compatibility alias for booleanOp(id, "intersect", ...). */
export const intersect = (
  id: ID,
  left: Selector,
  right: Selector,
  result?: string,
  deps?: ID[]
): BooleanOp => booleanOp(id, "intersect", left, right, result, deps);
