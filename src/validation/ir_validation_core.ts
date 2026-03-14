import { CompileError } from "../errors.js";
import {
  ANGLE_UNITS,
  AXIS_DIRECTIONS,
  EXTRUDE_MODES,
  EXTEND_SURFACE_MODES,
  HOLE_END_CONDITIONS,
  LENGTH_UNITS,
  PARAM_TYPES,
  RIB_THICKNESS_SIDES,
  SWEEP_ORIENTATIONS,
  THICKEN_DIRECTIONS,
  THREAD_HANDEDNESS,
  TRIM_SURFACE_KEEPS,
  UNWRAP_MODES,
  isContractValue,
} from "../ir_contract.js";
import type {
  AxisDirection,
  AxisSpec,
  Expr,
  ExtrudeAxis,
  ParamType,
  Path3D,
  PathSegment,
  PlaneRef,
  Point3D,
  Predicate,
  RankRule,
  Scalar,
  Selector,
  Unit,
} from "../ir.js";

export function validateSelector(selector: Selector | undefined): void {
  if (!selector) {
    throw new CompileError("validation_selector", "Selector is required");
  }
  ensureObject(selector, "validation_selector", "Selector must be an object");
  const kind = (selector as { kind?: string }).kind;

  if (kind === "selector.named") {
    ensureNonEmptyString(
      (selector as { name?: string }).name,
      "validation_selector_name",
      "Selector name is required"
    );
    return;
  }

  if (kind === "selector.face" || kind === "selector.edge" || kind === "selector.solid") {
    const predicates = ensureArray<Predicate>(
      (selector as { predicates?: Predicate[] }).predicates,
      "validation_selector_predicates",
      "Selector predicates must be an array"
    );
    const rank = ensureArray<RankRule>(
      (selector as { rank?: RankRule[] }).rank,
      "validation_selector_rank",
      "Selector rank must be an array"
    );
    for (const predicate of predicates) validatePredicate(predicate);
    for (const rule of rank) validateRankRule(rule);
    return;
  }

  throw new CompileError("validation_selector_kind", `Unknown selector kind ${String(kind)}`);
}

export function validatePredicate(predicate: Predicate): void {
  ensureObject(predicate, "validation_predicate", "Predicate must be an object");
  switch (predicate.kind) {
    case "pred.normal":
      ensureAxis(predicate.value, "Predicate normal axis is required");
      return;
    case "pred.planar":
      return;
    case "pred.createdBy":
      ensureNonEmptyString(
        predicate.featureId,
        "validation_predicate_created_by",
        "Predicate createdBy requires feature id"
      );
      return;
    case "pred.role":
      ensureNonEmptyString(
        predicate.value,
        "validation_predicate_role",
        "Predicate role is required"
      );
      return;
    default:
      throw new CompileError(
        "validation_predicate_kind",
        `Unknown predicate kind ${String((predicate as { kind?: string }).kind)}`
      );
  }
}

export function validateRankRule(rule: RankRule): void {
  ensureObject(rule, "validation_rank", "Rank rule must be an object");
  switch (rule.kind) {
    case "rank.maxArea":
    case "rank.minZ":
    case "rank.maxZ":
      return;
    case "rank.closestTo":
      validateSelector(rule.target);
      return;
    default:
      throw new CompileError(
        "validation_rank_kind",
        `Unknown rank rule kind ${String((rule as { kind?: string }).kind)}`
      );
  }
}

export function validateScalar(value: Scalar | undefined, label: string): void {
  if (value === undefined) {
    throw new CompileError("validation_scalar", `${label} is required`);
  }
  if (typeof value === "number") {
    ensureFiniteNumber(value, "validation_scalar", `${label} must be a number`);
    return;
  }
  validateExpr(value, label);
}

export function validateExpr(expr: Expr, label: string): void {
  ensureObject(expr, "validation_expr", `${label} must be an expression`);
  switch (expr.kind) {
    case "expr.literal":
      ensureFiniteNumber(
        expr.value,
        "validation_expr_literal",
        `${label} literal must be a number`
      );
      if (expr.unit !== undefined) ensureUnit(expr.unit);
      return;
    case "expr.param":
      ensureNonEmptyString(expr.id, "validation_expr_param", `${label} param id is required`);
      return;
    case "expr.binary":
      if (expr.op !== "+" && expr.op !== "-" && expr.op !== "*" && expr.op !== "/") {
        throw new CompileError("validation_expr_op", `Unknown expr op ${String(expr.op)}`);
      }
      validateExpr(expr.left, label);
      validateExpr(expr.right, label);
      return;
    case "expr.neg":
      validateExpr(expr.value, label);
      return;
    default:
      throw new CompileError(
        "validation_expr_kind",
        `Unknown expr kind ${String((expr as { kind?: string }).kind)}`
      );
  }
}

export function validatePoint2(point: unknown, label: string): void {
  const coords = ensureArray<Scalar>(point, "validation_point2", `${label} must be a 2D point`);
  if (coords.length !== 2) {
    throw new CompileError("validation_point2_length", `${label} must have 2 entries`);
  }
  validateScalar(coords[0], label);
  validateScalar(coords[1], label);
}

export function validatePoint3(value: unknown, code: string, message: string): void {
  const point = ensureArray<number>(value, code, message);
  if (point.length !== 3) throw new CompileError(code, message);
  for (const entry of point) ensureFiniteNumber(entry, code, message);
}

export function validatePoint3Scalar(value: unknown, label: string): void {
  const point = ensureArray<Scalar>(value, "validation_point3", `${label} must be a 3D point`);
  if (point.length !== 3) {
    throw new CompileError("validation_point3_length", `${label} must have 3 entries`);
  }
  for (const entry of point) validateScalar(entry, label);
}

export function validateAxisSpec(value: AxisSpec | undefined, message: string): void {
  if (!value) throw new CompileError("validation_axis", message);
  if (typeof value === "string") {
    ensureAxis(value, message);
    return;
  }
  if (value.kind === "axis.vector") {
    validatePoint3Scalar(value.direction, message);
    return;
  }
  if (value.kind === "axis.datum") {
    ensureNonEmptyString(value.ref, "validation_axis_datum", "Axis datum ref is required");
    return;
  }
  throw new CompileError("validation_axis", message);
}

export function validateExtrudeAxis(value: ExtrudeAxis, message: string): void {
  if (typeof value === "object" && value.kind === "axis.sketch.normal") return;
  validateAxisSpec(value as AxisSpec, message);
}

export function validateExtrudeMode(mode: unknown): void {
  if (isContractValue(EXTRUDE_MODES, mode)) return;
  throw new CompileError("validation_extrude_mode", 'Extrude mode must be "solid" or "surface"');
}

export function validateUnwrapMode(mode: unknown): void {
  if (isContractValue(UNWRAP_MODES, mode)) return;
  throw new CompileError("validation_unwrap_mode", 'Unwrap mode must be "strict" or "experimental"');
}

export function validateSweepOrientation(orientation: unknown): void {
  if (isContractValue(SWEEP_ORIENTATIONS, orientation)) return;
  throw new CompileError(
    "validation_sweep_orientation",
    'Sweep orientation must be "frenet" or "fixed"'
  );
}

export function validateRibThicknessSide(side: unknown): void {
  if (isContractValue(RIB_THICKNESS_SIDES, side)) return;
  throw new CompileError("validation_rib_side", 'Rib/Web side must be "symmetric" or "oneSided"');
}

export function validateThickenDirection(direction: unknown): void {
  if (isContractValue(THICKEN_DIRECTIONS, direction)) return;
  throw new CompileError(
    "validation_thicken_direction",
    'Thicken direction must be "normal" or "reverse"'
  );
}

export function validateTrimSurfaceKeep(keep: unknown): void {
  if (isContractValue(TRIM_SURFACE_KEEPS, keep)) return;
  throw new CompileError(
    "validation_trim_surface_keep",
    'Trim surface keep must be "inside", "outside", or "both"'
  );
}

export function validateExtendSurfaceMode(mode: unknown): void {
  if (isContractValue(EXTEND_SURFACE_MODES, mode)) return;
  throw new CompileError(
    "validation_extend_surface_mode",
    'Extend surface mode must be "natural" or "tangent"'
  );
}

export function validateShellDirection(direction: unknown): void {
  if (direction === TRIM_SURFACE_KEEPS[0] || direction === TRIM_SURFACE_KEEPS[1]) return;
  throw new CompileError(
    "validation_shell_direction",
    'Shell direction must be "inside" or "outside"'
  );
}

export function validateThreadHandedness(handedness: unknown): void {
  if (isContractValue(THREAD_HANDEDNESS, handedness)) return;
  throw new CompileError(
    "validation_thread_handedness",
    'Thread handedness must be "right" or "left"'
  );
}

export function validateHoleEndCondition(endCondition: unknown): void {
  if (isContractValue(HOLE_END_CONDITIONS, endCondition)) return;
  throw new CompileError(
    "validation_hole_end_condition",
    "Hole endCondition must be one of blind, throughAll, upToNext, upToLast"
  );
}

export function validatePlaneRef(value: PlaneRef, label: string): void {
  if (isSelector(value)) {
    validateSelector(value);
    return;
  }
  if (value && value.kind === "plane.datum") {
    ensureNonEmptyString(value.ref, "validation_plane_datum", `${label} datum ref is required`);
    return;
  }
  throw new CompileError("validation_plane_ref", `${label} is invalid`);
}

export function validatePath3D(value: Path3D | undefined, label: string): void {
  if (!value || typeof value !== "object") {
    throw new CompileError("validation_path", `${label} must be a path`);
  }
  if (value.kind === "path.polyline") {
    const points = ensureArray<Point3D>(
      value.points,
      "validation_path_points",
      `${label} points must be an array`
    );
    if (points.length < 2) {
      throw new CompileError("validation_path_points", `${label} needs at least 2 points`);
    }
    for (const point of points) validatePoint3Scalar(point, `${label} point`);
    return;
  }
  if (value.kind === "path.spline") {
    const points = ensureArray<Point3D>(
      value.points,
      "validation_path_points",
      `${label} points must be an array`
    );
    if (points.length < 2) {
      throw new CompileError("validation_path_points", `${label} needs at least 2 points`);
    }
    for (const point of points) validatePoint3Scalar(point, `${label} point`);
    if (value.degree !== undefined) validateScalar(value.degree, `${label} spline degree`);
    return;
  }
  if (value.kind === "path.segments") {
    const segments = ensureArray<PathSegment>(
      value.segments,
      "validation_path_segments",
      `${label} segments must be an array`
    );
    if (segments.length === 0) {
      throw new CompileError("validation_path_segments", `${label} needs segments`);
    }
    for (const segment of segments) validatePathSegment(segment, label);
    return;
  }
  throw new CompileError("validation_path", `${label} has unknown kind`);
}

export function validatePathSegment(segment: PathSegment, label: string): void {
  if (!segment || typeof segment !== "object") {
    throw new CompileError("validation_path_segment", `${label} segment invalid`);
  }
  switch (segment.kind) {
    case "path.line":
      validatePoint3Scalar(segment.start, `${label} line start`);
      validatePoint3Scalar(segment.end, `${label} line end`);
      return;
    case "path.arc":
      validatePoint3Scalar(segment.start, `${label} arc start`);
      validatePoint3Scalar(segment.end, `${label} arc end`);
      validatePoint3Scalar(segment.center, `${label} arc center`);
      if (
        segment.direction !== undefined &&
        segment.direction !== "cw" &&
        segment.direction !== "ccw"
      ) {
        throw new CompileError("validation_path_direction", `${label} arc direction invalid`);
      }
      return;
  }
  throw new CompileError("validation_path_segment", `${label} segment kind invalid`);
}

export function ensureAxis(value: AxisDirection | undefined, message: string): void {
  if (!value || !isContractValue(AXIS_DIRECTIONS, value)) {
    throw new CompileError("validation_axis", message);
  }
}

export function isSelector(value: unknown): value is Selector {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: string }).kind;
  return (
    kind === "selector.face" ||
    kind === "selector.edge" ||
    kind === "selector.solid" ||
    kind === "selector.named"
  );
}

export function ensureUnit(value: Unit): void {
  if (!isContractValue(LENGTH_UNITS, value) && !isContractValue(ANGLE_UNITS, value)) {
    throw new CompileError("validation_unit", `Unknown unit ${String(value)}`);
  }
}

export function ensureTuple2(value: [unknown, unknown] | undefined, label: string): void {
  if (!value || !Array.isArray(value) || value.length !== 2) {
    throw new CompileError("validation_tuple2", `${label} must be a tuple of length 2`);
  }
}

export function ensureObject(value: unknown, code: string, message: string): void {
  if (!value || typeof value !== "object") throw new CompileError(code, message);
}

export function ensureArray<T>(value: unknown, code: string, message: string): T[] {
  if (!Array.isArray(value)) throw new CompileError(code, message);
  return value as T[];
}

export function ensureNonEmptyString(value: unknown, code: string, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CompileError(code, message);
  }
  return value;
}

export function ensureFiniteNumber(value: unknown, code: string, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CompileError(code, message);
  }
}

export function isParamType(value: ParamType): boolean {
  return isContractValue(PARAM_TYPES, value);
}
