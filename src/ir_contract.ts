export const TF_IR_SCHEMA = "trueform.ir.v1";
export const TF_IR_VERSION = 1 as const;

export const LENGTH_UNITS = ["mm", "cm", "m", "in"] as const;
export const ANGLE_UNITS = ["rad", "deg"] as const;
export const UNITS = [...LENGTH_UNITS, ...ANGLE_UNITS] as const;
export const AXIS_DIRECTIONS = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"] as const;
export const PARAM_TYPES = ["length", "angle", "count"] as const;
export const EXPR_BINARY_OPERATORS = ["+", "-", "*", "/"] as const;
export const EXTRUDE_MODES = ["solid", "surface"] as const;
export const THICKEN_DIRECTIONS = ["normal", "reverse"] as const;
export const UNWRAP_MODES = ["strict", "experimental"] as const;
export const THREAD_HANDEDNESS = ["right", "left"] as const;
export const HOLE_END_CONDITIONS = ["blind", "throughAll", "upToNext", "upToLast"] as const;
export const RIB_THICKNESS_SIDES = ["symmetric", "oneSided"] as const;
export const SWEEP_ORIENTATIONS = ["frenet", "fixed"] as const;
export const TRIM_SURFACE_KEEPS = ["inside", "outside", "both"] as const;
export const EXTEND_SURFACE_MODES = ["natural", "tangent"] as const;
export const POINT_LOCATORS = ["center", "mid", "start", "end"] as const;
export const DATUM_MODIFIERS = ["MMB", "LMB", "RMB"] as const;
export const TOLERANCE_MODIFIERS = [
  "MMC",
  "LMC",
  "RFS",
  "PROJECTED",
  "FREE_STATE",
  "TANGENT_PLANE",
  "STATISTICAL",
] as const;

export function isContractValue<T extends readonly string[]>(
  values: T,
  value: unknown
): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}
