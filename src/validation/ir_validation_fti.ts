import type {
  CosmeticThread,
  DatumModifier,
  DatumRef,
  DimensionAngle,
  DimensionDistance,
  FTIConstraint,
  FTIDatum,
  FlatnessConstraint,
  GeometryRef,
  ID,
  ParallelismConstraint,
  PerpendicularityConstraint,
  PositionConstraint,
  RefFrame,
  RefSurface,
  Scalar,
  Selector,
  SizeConstraint,
  ToleranceModifier,
} from "../ir.js";
import { CompileError } from "../errors.js";

const DATUM_MODIFIERS = new Set<DatumModifier>(["MMB", "LMB", "RMB"]);
const TOLERANCE_MODIFIERS = new Set<ToleranceModifier>([
  "MMC",
  "LMC",
  "RFS",
  "PROJECTED",
  "FREE_STATE",
  "TANGENT_PLANE",
  "STATISTICAL",
]);
const POSITION_ZONES = new Set<PositionConstraint["zone"]>(["diameter", "cartesian"]);

export type FtiValidationDeps = {
  ensureArray: <T>(value: unknown, code: string, message: string) => T[];
  ensureNonEmptyString: (value: unknown, code: string, message: string) => string;
  ensureObject: (value: unknown, code: string, message: string) => void;
  validateScalar: (value: Scalar | undefined, label: string) => void;
  validateSelector: (selector: Selector | undefined) => void;
  validateThreadHandedness: (handedness: unknown) => void;
  scalarLiteral: (value: Scalar | undefined) => number | null;
};

export function validateDatum(deps: FtiValidationDeps, datum: FTIDatum): void {
  deps.ensureObject(datum, "validation_datum", "Datum must be an object");
  deps.ensureNonEmptyString(datum.id, "validation_datum_id", "Datum id is required");
  deps.ensureNonEmptyString(datum.label, "validation_datum_label", "Datum label is required");
  validateGeometryRef(deps, datum.target, "Datum target");
  if (datum.modifiers !== undefined) validateDatumModifiers(deps, datum.modifiers, "Datum modifiers");
  if (datum.capabilities !== undefined) validateIdArray(deps, datum.capabilities, "Datum capabilities");
  if (datum.requirement !== undefined) {
    deps.ensureNonEmptyString(
      datum.requirement,
      "validation_datum_requirement",
      "Datum requirement must be a string"
    );
  }
}

export function validateConstraint(
  deps: FtiValidationDeps,
  constraint: FTIConstraint,
  datumIds: Set<ID>
): void {
  deps.ensureObject(constraint, "validation_constraint", "Constraint must be an object");
  const kind = (constraint as { kind?: string }).kind;
  deps.ensureNonEmptyString(kind, "validation_constraint_kind", "Constraint kind is required");
  deps.ensureNonEmptyString(
    (constraint as { id?: ID }).id,
    "validation_constraint_id",
    "Constraint id is required"
  );

  switch (kind) {
    case "constraint.surfaceProfile": {
      const entry = constraint as {
        target?: RefSurface;
        tolerance?: Scalar;
        referenceFrame?: RefFrame;
        capabilities?: ID[];
        requirement?: ID;
      };
      validateRefSurface(deps, entry.target, "Surface profile target");
      validatePositiveScalar(deps, entry.tolerance, "Surface profile tolerance");
      if (entry.referenceFrame !== undefined) validateRefFrame(deps, entry.referenceFrame, "Surface profile reference frame");
      if (entry.capabilities !== undefined) validateIdArray(deps, entry.capabilities, "Surface profile capabilities");
      validateRequirement(deps, entry.requirement, "Surface profile requirement must be a string");
      return;
    }
    case "constraint.flatness": {
      const entry = constraint as FlatnessConstraint;
      validateRefSurface(deps, entry.target, "Flatness target");
      validatePositiveScalar(deps, entry.tolerance, "Flatness tolerance");
      if (entry.capabilities !== undefined) validateIdArray(deps, entry.capabilities, "Flatness capabilities");
      validateRequirement(deps, entry.requirement, "Flatness requirement must be a string");
      return;
    }
    case "constraint.parallelism": {
      const entry = constraint as ParallelismConstraint;
      validateRefSurface(deps, entry.target, "Parallelism target");
      validatePositiveScalar(deps, entry.tolerance, "Parallelism tolerance");
      validateDatumRefs(deps, entry.datum, datumIds, "Parallelism datum refs");
      if (entry.modifiers !== undefined) validateToleranceModifiers(deps, entry.modifiers, "Parallelism modifiers");
      if (entry.capabilities !== undefined) validateIdArray(deps, entry.capabilities, "Parallelism capabilities");
      validateRequirement(deps, entry.requirement, "Parallelism requirement must be a string");
      return;
    }
    case "constraint.perpendicularity": {
      const entry = constraint as PerpendicularityConstraint;
      validateRefSurface(deps, entry.target, "Perpendicularity target");
      validatePositiveScalar(deps, entry.tolerance, "Perpendicularity tolerance");
      validateDatumRefs(deps, entry.datum, datumIds, "Perpendicularity datum refs");
      if (entry.modifiers !== undefined) validateToleranceModifiers(deps, entry.modifiers, "Perpendicularity modifiers");
      if (entry.capabilities !== undefined) validateIdArray(deps, entry.capabilities, "Perpendicularity capabilities");
      validateRequirement(deps, entry.requirement, "Perpendicularity requirement must be a string");
      return;
    }
    case "constraint.position": {
      const entry = constraint as PositionConstraint;
      validateGeometryRef(deps, entry.target, "Position target");
      validatePositiveScalar(deps, entry.tolerance, "Position tolerance");
      validateDatumRefs(deps, entry.datum, datumIds, "Position datum refs");
      if (entry.modifiers !== undefined) validateToleranceModifiers(deps, entry.modifiers, "Position modifiers");
      if (entry.capabilities !== undefined) validateIdArray(deps, entry.capabilities, "Position capabilities");
      validateRequirement(deps, entry.requirement, "Position requirement must be a string");
      if (entry.zone !== undefined && !POSITION_ZONES.has(entry.zone)) {
        throw new CompileError(
          "validation_constraint_zone",
          `Unsupported position zone ${String(entry.zone)}`
        );
      }
      return;
    }
    case "constraint.size": {
      const entry = constraint as SizeConstraint;
      validateGeometryRef(deps, entry.target, "Size target");
      const hasNominal = entry.nominal !== undefined || entry.tolerance !== undefined;
      const hasLimits = entry.min !== undefined || entry.max !== undefined;
      if (!hasNominal && !hasLimits) {
        throw new CompileError(
          "validation_constraint_size",
          "Size constraint must include nominal+tolerance or min+max"
        );
      }
      if (hasNominal) {
        deps.validateScalar(entry.nominal, "Size nominal");
        validatePositiveScalar(deps, entry.tolerance, "Size tolerance");
      }
      if (hasLimits) {
        deps.validateScalar(entry.min, "Size min");
        deps.validateScalar(entry.max, "Size max");
        const minVal = deps.scalarLiteral(entry.min);
        const maxVal = deps.scalarLiteral(entry.max);
        if (minVal !== null && maxVal !== null && minVal > maxVal) {
          throw new CompileError("validation_constraint_size_limits", "Size min must be <= max");
        }
      }
      if (entry.modifiers !== undefined) validateToleranceModifiers(deps, entry.modifiers, "Size modifiers");
      if (entry.capabilities !== undefined) validateIdArray(deps, entry.capabilities, "Size capabilities");
      validateRequirement(deps, entry.requirement, "Size requirement must be a string");
      return;
    }
    case "dimension.distance": {
      const entry = constraint as DimensionDistance;
      validateGeometryRef(deps, entry.from, "Distance dimension from");
      validateGeometryRef(deps, entry.to, "Distance dimension to");
      validateDimensionToleranceFields(deps, entry, "Distance dimension");
      if (entry.capabilities !== undefined) validateIdArray(deps, entry.capabilities, "Distance dimension capabilities");
      validateRequirement(deps, entry.requirement, "Distance dimension requirement must be a string");
      return;
    }
    case "dimension.angle": {
      const entry = constraint as DimensionAngle;
      validateGeometryRef(deps, entry.from, "Angle dimension from");
      validateGeometryRef(deps, entry.to, "Angle dimension to");
      validateDimensionToleranceFields(deps, entry, "Angle dimension");
      if (entry.capabilities !== undefined) validateIdArray(deps, entry.capabilities, "Angle dimension capabilities");
      validateRequirement(deps, entry.requirement, "Angle dimension requirement must be a string");
      return;
    }
    default:
      throw new CompileError(
        "validation_constraint_kind",
        `Unknown constraint kind ${String(kind)}`
      );
  }
}

export function validateCosmeticThread(deps: FtiValidationDeps, thread: CosmeticThread): void {
  deps.ensureObject(thread, "validation_thread", "Cosmetic thread must be an object");
  deps.ensureNonEmptyString(thread.id, "validation_thread_id", "Thread id is required");
  if (thread.kind !== "thread.cosmetic") {
    throw new CompileError(
      "validation_thread_kind",
      `Unsupported thread kind ${String((thread as { kind?: unknown }).kind)}`
    );
  }
  validateGeometryRef(deps, thread.target, "Thread target");
  validateOptionalString(deps, thread.designation, "validation_thread_designation", "Thread designation must be a string");
  validateOptionalString(deps, thread.standard, "validation_thread_standard", "Thread standard must be a string");
  validateOptionalString(deps, thread.series, "validation_thread_series", "Thread series must be a string");
  validateOptionalString(deps, thread.class, "validation_thread_class", "Thread class must be a string");
  if (thread.handedness !== undefined) deps.validateThreadHandedness(thread.handedness);
  if (thread.internal !== undefined && typeof thread.internal !== "boolean") {
    throw new CompileError("validation_thread_internal", "Thread internal flag must be a boolean");
  }
  validateOptionalScalar(deps, thread.majorDiameter, "Thread major diameter");
  validateOptionalScalar(deps, thread.minorDiameter, "Thread minor diameter");
  validateOptionalScalar(deps, thread.pitch, "Thread pitch");
  validateOptionalScalar(deps, thread.length, "Thread length");
  validateOptionalScalar(deps, thread.depth, "Thread depth");
  if (thread.notes !== undefined) {
    const notes = deps.ensureArray<string>(
      thread.notes,
      "validation_thread_notes",
      "Thread notes must be an array"
    );
    for (const note of notes) {
      deps.ensureNonEmptyString(note, "validation_thread_note", "Thread note must be a string");
    }
  }
  if (thread.designation === undefined && (thread.majorDiameter === undefined || thread.pitch === undefined)) {
    throw new CompileError(
      "validation_thread_required",
      "Thread requires designation or both majorDiameter and pitch"
    );
  }
}

function validateGeometryRef(deps: FtiValidationDeps, ref: GeometryRef, label: string): void {
  deps.ensureObject(ref, "validation_ref", `${label} must be an object`);
  switch (ref.kind) {
    case "ref.surface":
    case "ref.frame":
    case "ref.edge":
    case "ref.axis":
      deps.validateSelector(ref.selector);
      return;
    case "ref.point":
      deps.validateSelector(ref.selector);
      if (
        ref.locator !== undefined &&
        ref.locator !== "center" &&
        ref.locator !== "mid" &&
        ref.locator !== "start" &&
        ref.locator !== "end"
      ) {
        throw new CompileError(
          "validation_ref_point_locator",
          `Unsupported point locator ${String(ref.locator)}`
        );
      }
      return;
    default:
      throw new CompileError(
        "validation_ref_kind",
        `Unknown geometry ref kind ${String((ref as { kind?: string }).kind)}`
      );
  }
}

function validateRefSurface(deps: FtiValidationDeps, ref: RefSurface | undefined, label: string): void {
  if (!ref) throw new CompileError("validation_ref_surface", `${label} is required`);
  if (ref.kind !== "ref.surface") {
    throw new CompileError("validation_ref_surface", `${label} must be ref.surface`);
  }
  deps.validateSelector(ref.selector);
}

function validateRefFrame(deps: FtiValidationDeps, ref: RefFrame, label: string): void {
  if (!ref || ref.kind !== "ref.frame") {
    throw new CompileError("validation_ref_frame", `${label} must be ref.frame`);
  }
  deps.validateSelector(ref.selector);
}

function validateDatumRefs(
  deps: FtiValidationDeps,
  refs: DatumRef[],
  datumIds: Set<ID>,
  label: string
): void {
  if (!Array.isArray(refs) || refs.length === 0) {
    throw new CompileError(
      "validation_constraint_datum_required",
      `${label} must include at least one datum`
    );
  }
  if (datumIds.size === 0) {
    throw new CompileError(
      "validation_constraint_datum_missing",
      `${label} references datums but none are defined on the part`
    );
  }
  for (const ref of refs) validateDatumRef(deps, ref, datumIds);
}

function validateDatumRef(
  deps: FtiValidationDeps,
  ref: DatumRef,
  datumIds: Set<ID>
): void {
  deps.ensureObject(ref, "validation_datum_ref", "Datum ref must be an object");
  if (ref.kind !== "datum.ref") {
    throw new CompileError("validation_datum_ref", "Datum ref kind must be datum.ref");
  }
  deps.ensureNonEmptyString(ref.datum, "validation_datum_ref_id", "Datum ref id is required");
  if (datumIds.size > 0 && !datumIds.has(ref.datum)) {
    throw new CompileError("validation_datum_ref_missing", `Datum ref ${ref.datum} not found`);
  }
  if (ref.modifiers !== undefined) validateDatumModifiers(deps, ref.modifiers, "Datum ref modifiers");
}

function validateDatumModifiers(
  deps: FtiValidationDeps,
  modifiers: DatumModifier[],
  label: string
): void {
  const list = deps.ensureArray<DatumModifier>(
    modifiers,
    "validation_datum_modifiers",
    `${label} must be an array`
  );
  for (const mod of list) {
    if (!DATUM_MODIFIERS.has(mod)) {
      throw new CompileError("validation_datum_modifier", `Unknown datum modifier ${String(mod)}`);
    }
  }
}

function validateToleranceModifiers(
  deps: FtiValidationDeps,
  modifiers: ToleranceModifier[],
  label: string
): void {
  const list = deps.ensureArray<ToleranceModifier>(
    modifiers,
    "validation_tolerance_modifiers",
    `${label} must be an array`
  );
  for (const mod of list) {
    if (!TOLERANCE_MODIFIERS.has(mod)) {
      throw new CompileError(
        "validation_tolerance_modifier",
        `Unknown tolerance modifier ${String(mod)}`
      );
    }
  }
}

function validateIdArray(deps: FtiValidationDeps, values: ID[], label: string): void {
  const list = deps.ensureArray<ID>(values, "validation_id_array", `${label} must be an array`);
  for (const value of list) {
    deps.ensureNonEmptyString(value, "validation_id_array_item", `${label} must be strings`);
  }
}

function validatePositiveScalar(
  deps: FtiValidationDeps,
  value: Scalar | undefined,
  label: string
): void {
  deps.validateScalar(value, label);
  const literal = deps.scalarLiteral(value);
  if (literal !== null && literal <= 0) {
    throw new CompileError("validation_scalar_positive", `${label} must be > 0`);
  }
}

function validateNonNegativeScalar(
  deps: FtiValidationDeps,
  value: Scalar | undefined,
  label: string
): void {
  deps.validateScalar(value, label);
  const literal = deps.scalarLiteral(value);
  if (literal !== null && literal < 0) {
    throw new CompileError("validation_scalar_non_negative", `${label} must be >= 0`);
  }
}

function validateDimensionToleranceFields(
  deps: FtiValidationDeps,
  value: {
    nominal?: Scalar;
    tolerance?: Scalar;
    plus?: Scalar;
    minus?: Scalar;
  },
  label: string
): void {
  if (value.nominal !== undefined) deps.validateScalar(value.nominal, `${label} nominal`);
  const hasSymmetric = value.tolerance !== undefined;
  const hasBilateral = value.plus !== undefined || value.minus !== undefined;
  if (hasSymmetric && hasBilateral) {
    throw new CompileError(
      "validation_dimension_tolerance_shape",
      `${label} cannot mix symmetric tolerance with plus/minus`
    );
  }
  if (hasBilateral && (value.plus === undefined || value.minus === undefined)) {
    throw new CompileError(
      "validation_dimension_tolerance_shape",
      `${label} plus/minus must both be provided`
    );
  }
  if ((hasSymmetric || hasBilateral) && value.nominal === undefined) {
    throw new CompileError(
      "validation_dimension_tolerance_shape",
      `${label} nominal is required when tolerance is provided`
    );
  }
  if (value.tolerance !== undefined) validatePositiveScalar(deps, value.tolerance, `${label} tolerance`);
  if (value.plus !== undefined) validateNonNegativeScalar(deps, value.plus, `${label} plus tolerance`);
  if (value.minus !== undefined) validateNonNegativeScalar(deps, value.minus, `${label} minus tolerance`);
}

function validateRequirement(deps: FtiValidationDeps, value: ID | undefined, message: string): void {
  if (value !== undefined) {
    deps.ensureNonEmptyString(value, "validation_constraint_requirement", message);
  }
}

function validateOptionalString(
  deps: FtiValidationDeps,
  value: string | undefined,
  code: string,
  message: string
): void {
  if (value !== undefined) deps.ensureNonEmptyString(value, code, message);
}

function validateOptionalScalar(
  deps: FtiValidationDeps,
  value: Scalar | undefined,
  label: string
): void {
  if (value !== undefined) deps.validateScalar(value, label);
}
