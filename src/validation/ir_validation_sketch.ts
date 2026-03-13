import type {
  ID,
  PatternRef,
  Point2D,
  Profile,
  ProfileRef,
  Scalar,
  SketchConstraint,
  SketchConstraintPointRef,
  SketchEntity,
  SketchProfile,
} from "../ir.js";
import { CompileError } from "../errors.js";

export type SketchValidationDeps = {
  ensureArray: <T>(value: unknown, code: string, message: string) => T[];
  ensureNonEmptyString: (value: unknown, code: string, message: string) => string;
  ensureObject: (value: unknown, code: string, message: string) => void;
  validateNonNegativeScalar: (value: Scalar | undefined, label: string) => void;
  validatePoint2: (point: unknown, label: string) => void;
  validatePoint3: (value: unknown, code: string, message: string) => void;
  validateScalar: (value: Scalar | undefined, label: string) => void;
  validatePositiveScalar: (value: Scalar | undefined, label: string) => void;
  scalarLiteral: (value: Scalar | undefined) => number | null;
};

export function validateSketchProfile(
  deps: SketchValidationDeps,
  profile: SketchProfile,
  entityMap?: Map<ID, SketchEntity>
): void {
  deps.ensureObject(profile, "validation_profile", "Sketch profile must be an object");
  deps.ensureNonEmptyString(
    profile.name,
    "validation_profile_name",
    "Sketch profile name is required"
  );
  validateProfile(deps, profile.profile);
  if (profile.profile.kind !== "profile.sketch") return;
  if (!entityMap || entityMap.size === 0) {
    throw new CompileError(
      "validation_sketch_profile_entities_missing",
      "profile.sketch requires sketch entities"
    );
  }
  const ids = new Set<ID>();
  validateSketchProfileLoopIds(profile.profile.loop, entityMap, ids, "loop");
  for (const hole of profile.profile.holes ?? []) {
    validateSketchProfileLoopIds(hole, entityMap, undefined, "hole");
  }
}

export function validateSketchEntity(
  deps: SketchValidationDeps,
  entity: SketchEntity
): void {
  deps.ensureObject(entity, "validation_sketch_entity", "Sketch entity must be an object");
  deps.ensureNonEmptyString(
    entity.id,
    "validation_sketch_entity_id",
    "Sketch entity id is required"
  );

  switch (entity.kind) {
    case "sketch.line":
      deps.validatePoint2(entity.start, "Sketch line start");
      deps.validatePoint2(entity.end, "Sketch line end");
      return;
    case "sketch.arc":
      deps.validatePoint2(entity.start, "Sketch arc start");
      deps.validatePoint2(entity.end, "Sketch arc end");
      deps.validatePoint2(entity.center, "Sketch arc center");
      if (entity.direction !== "cw" && entity.direction !== "ccw") {
        throw new CompileError(
          "validation_sketch_arc_direction",
          `Unknown arc direction ${String(entity.direction)}`
        );
      }
      return;
    case "sketch.circle":
      deps.validatePoint2(entity.center, "Sketch circle center");
      deps.validateScalar(entity.radius, "Sketch circle radius");
      return;
    case "sketch.ellipse":
      deps.validatePoint2(entity.center, "Sketch ellipse center");
      deps.validateScalar(entity.radiusX, "Sketch ellipse radiusX");
      deps.validateScalar(entity.radiusY, "Sketch ellipse radiusY");
      if (entity.rotation !== undefined) {
        deps.validateScalar(entity.rotation, "Sketch ellipse rotation");
      }
      return;
    case "sketch.rectangle": {
      const rect = entity as {
        mode?: "center" | "corner";
        center?: Point2D;
        corner?: Point2D;
        width?: Scalar;
        height?: Scalar;
        rotation?: Scalar;
      };
      if (rect.mode !== "center" && rect.mode !== "corner") {
        throw new CompileError(
          "validation_sketch_rect_mode",
          `Unknown rectangle mode ${String(rect.mode)}`
        );
      }
      if (rect.mode === "center") {
        if (!rect.center) {
          throw new CompileError(
            "validation_sketch_rect_center",
            "Sketch rectangle center is required"
          );
        }
        deps.validatePoint2(rect.center, "Sketch rectangle center");
      } else {
        if (!rect.corner) {
          throw new CompileError(
            "validation_sketch_rect_corner",
            "Sketch rectangle corner is required"
          );
        }
        deps.validatePoint2(rect.corner, "Sketch rectangle corner");
      }
      deps.validateScalar(rect.width, "Sketch rectangle width");
      deps.validateScalar(rect.height, "Sketch rectangle height");
      if (rect.rotation !== undefined) deps.validateScalar(rect.rotation, "Sketch rectangle rotation");
      return;
    }
    case "sketch.slot":
      deps.validatePoint2(entity.center, "Sketch slot center");
      deps.validateScalar(entity.length, "Sketch slot length");
      deps.validateScalar(entity.width, "Sketch slot width");
      if (entity.rotation !== undefined) deps.validateScalar(entity.rotation, "Sketch slot rotation");
      if (entity.endStyle !== undefined && entity.endStyle !== "arc" && entity.endStyle !== "straight") {
        throw new CompileError(
          "validation_sketch_slot_endstyle",
          `Unknown slot end style ${String(entity.endStyle)}`
        );
      }
      return;
    case "sketch.polygon":
      deps.validatePoint2(entity.center, "Sketch polygon center");
      deps.validateScalar(entity.radius, "Sketch polygon radius");
      deps.validateScalar(entity.sides, "Sketch polygon sides");
      if (entity.rotation !== undefined) deps.validateScalar(entity.rotation, "Sketch polygon rotation");
      return;
    case "sketch.spline": {
      const points = deps.ensureArray<Point2D>(
        entity.points,
        "validation_sketch_spline_points",
        "Sketch spline points must be an array"
      );
      if (points.length < 2) {
        throw new CompileError(
          "validation_sketch_spline_points",
          "Sketch spline must have at least 2 points"
        );
      }
      for (const point of points) deps.validatePoint2(point, "Sketch spline point");
      if (entity.degree !== undefined) deps.validateScalar(entity.degree, "Sketch spline degree");
      return;
    }
    case "sketch.point":
      deps.validatePoint2(entity.point, "Sketch point");
      return;
    default:
      throw new CompileError(
        "validation_sketch_entity_kind",
        `Unknown sketch entity kind ${String((entity as { kind?: string }).kind)}`
      );
  }
}

export function validateSketchConstraint(
  deps: SketchValidationDeps,
  constraint: SketchConstraint
): void {
  deps.ensureObject(
    constraint,
    "validation_sketch_constraint",
    "Sketch constraint must be an object"
  );
  deps.ensureNonEmptyString(
    constraint.id,
    "validation_sketch_constraint_id",
    "Sketch constraint id is required"
  );

  switch (constraint.kind) {
    case "sketch.constraint.coincident":
      validateSketchConstraintPointRef(deps, constraint.a, "Sketch coincident point a");
      validateSketchConstraintPointRef(deps, constraint.b, "Sketch coincident point b");
      return;
    case "sketch.constraint.horizontal":
    case "sketch.constraint.vertical":
      deps.ensureNonEmptyString(
        constraint.line,
        "validation_sketch_constraint_line",
        "Sketch line constraint requires a line id"
      );
      return;
    case "sketch.constraint.parallel":
    case "sketch.constraint.perpendicular":
    case "sketch.constraint.equalLength":
    case "sketch.constraint.tangent":
    case "sketch.constraint.concentric":
    case "sketch.constraint.collinear":
      deps.ensureNonEmptyString(
        constraint.a,
        "validation_sketch_constraint_line",
        "Sketch two-entity constraint requires entity a"
      );
      deps.ensureNonEmptyString(
        constraint.b,
        "validation_sketch_constraint_line",
        "Sketch two-entity constraint requires entity b"
      );
      return;
    case "sketch.constraint.pointOnLine":
      validateSketchConstraintPointRef(deps, constraint.point, "Sketch pointOnLine point");
      deps.ensureNonEmptyString(
        constraint.line,
        "validation_sketch_constraint_line",
        "Sketch pointOnLine constraint requires line id"
      );
      return;
    case "sketch.constraint.midpoint":
      validateSketchConstraintPointRef(deps, constraint.point, "Sketch midpoint point");
      deps.ensureNonEmptyString(
        constraint.line,
        "validation_sketch_constraint_line",
        "Sketch midpoint constraint requires line id"
      );
      return;
    case "sketch.constraint.symmetry":
      validateSketchConstraintPointRef(deps, constraint.a, "Sketch symmetry point a");
      validateSketchConstraintPointRef(deps, constraint.b, "Sketch symmetry point b");
      deps.ensureNonEmptyString(
        constraint.axis,
        "validation_sketch_constraint_line",
        "Sketch symmetry constraint requires axis line id"
      );
      return;
    case "sketch.constraint.distance":
      validateSketchConstraintPointRef(deps, constraint.a, "Sketch distance point a");
      validateSketchConstraintPointRef(deps, constraint.b, "Sketch distance point b");
      deps.validateScalar(constraint.distance, "Sketch distance constraint");
      return;
    case "sketch.constraint.angle":
      deps.ensureNonEmptyString(
        constraint.a,
        "validation_sketch_constraint_line",
        "Sketch angle constraint requires line a"
      );
      deps.ensureNonEmptyString(
        constraint.b,
        "validation_sketch_constraint_line",
        "Sketch angle constraint requires line b"
      );
      validateSketchConstraintAngle(deps, constraint.angle);
      return;
    case "sketch.constraint.radius":
      deps.ensureNonEmptyString(
        constraint.curve,
        "validation_sketch_constraint_curve",
        "Sketch radius constraint requires a curve id"
      );
      deps.validatePositiveScalar(constraint.radius, "Sketch radius constraint");
      return;
    case "sketch.constraint.fixPoint":
      validateSketchConstraintPointRef(deps, constraint.point, "Sketch fixPoint target");
      if (constraint.x === undefined && constraint.y === undefined) {
        throw new CompileError(
          "validation_sketch_constraint_fix_point_target",
          "Sketch fixPoint constraint requires x and/or y"
        );
      }
      if (constraint.x !== undefined) deps.validateScalar(constraint.x, "Sketch fixPoint x");
      if (constraint.y !== undefined) deps.validateScalar(constraint.y, "Sketch fixPoint y");
      return;
    default:
      throw new CompileError(
        "validation_sketch_constraint_kind",
        `Unknown sketch constraint kind ${String((constraint as { kind?: unknown }).kind)}`
      );
  }
}

export function validateProfileRef(
  deps: SketchValidationDeps,
  profile: ProfileRef | undefined
): void {
  if (!profile) {
    throw new CompileError("validation_profile_ref", "Profile reference is required");
  }
  if ((profile as { kind?: string }).kind === "profile.ref") {
    deps.ensureNonEmptyString(
      (profile as { name?: string }).name,
      "validation_profile_ref_name",
      "Profile ref name is required"
    );
    return;
  }
  validateProfile(deps, profile as Profile);
}

export function validatePatternRef(
  deps: Pick<SketchValidationDeps, "ensureObject" | "ensureNonEmptyString">,
  pattern: PatternRef
): void {
  deps.ensureObject(pattern, "validation_pattern_ref", "Pattern ref must be an object");
  const kind = (pattern as { kind?: string }).kind;
  if (kind !== "pattern.linear" && kind !== "pattern.circular") {
    throw new CompileError(
      "validation_pattern_ref_kind",
      `Unknown pattern ref kind ${String(kind)}`
    );
  }
  deps.ensureNonEmptyString(
    (pattern as { ref?: string }).ref,
    "validation_pattern_ref_id",
    "Pattern ref id is required"
  );
}

export function validateDepth(
  deps: Pick<SketchValidationDeps, "validateScalar">,
  depth: Scalar | "throughAll" | undefined
): void {
  if (depth === "throughAll") return;
  deps.validateScalar(depth, "Feature depth");
}

function validateProfile(deps: SketchValidationDeps, profile: Profile): void {
  deps.ensureObject(profile, "validation_profile", "Profile must be an object");
  switch (profile.kind) {
    case "profile.rectangle":
      deps.validateScalar(profile.width, "Profile width");
      deps.validateScalar(profile.height, "Profile height");
      if (profile.center !== undefined) {
        deps.validatePoint3(
          profile.center,
          "validation_profile_center",
          "Profile center must be a 3D point"
        );
      }
      return;
    case "profile.circle":
      deps.validateScalar(profile.radius, "Profile radius");
      if (profile.center !== undefined) {
        deps.validatePoint3(
          profile.center,
          "validation_profile_center",
          "Profile center must be a 3D point"
        );
      }
      return;
    case "profile.poly":
      deps.validateScalar(profile.sides, "Profile polygon sides");
      deps.validateScalar(profile.radius, "Profile polygon radius");
      if (profile.center !== undefined) {
        deps.validatePoint3(
          profile.center,
          "validation_profile_center",
          "Profile center must be a 3D point"
        );
      }
      if (profile.rotation !== undefined) deps.validateScalar(profile.rotation, "Profile polygon rotation");
      return;
    case "profile.sketch": {
      if (profile.open !== undefined && typeof profile.open !== "boolean") {
        throw new CompileError(
          "validation_profile_sketch_open",
          "profile.sketch open must be a boolean"
        );
      }
      if (profile.open && profile.holes && profile.holes.length > 0) {
        throw new CompileError(
          "validation_profile_sketch_open_holes",
          "profile.sketch open profiles cannot define holes"
        );
      }
      const loop = deps.ensureArray<ID>(
        profile.loop,
        "validation_profile_sketch_loop",
        "Sketch profile loop must be an array"
      );
      if (loop.length === 0) {
        throw new CompileError(
          "validation_profile_sketch_loop",
          "Sketch profile loop must not be empty"
        );
      }
      for (const id of loop) {
        deps.ensureNonEmptyString(
          id,
          "validation_profile_sketch_loop_id",
          "Sketch profile loop id must be a string"
        );
      }
      if (profile.holes !== undefined) {
        const holes = deps.ensureArray<ID[]>(
          profile.holes as ID[][],
          "validation_profile_sketch_holes",
          "Sketch profile holes must be an array"
        );
        for (const hole of holes) {
          const loopIds = deps.ensureArray<ID>(
            hole,
            "validation_profile_sketch_hole",
            "Sketch profile hole must be an array"
          );
          if (loopIds.length === 0) {
            throw new CompileError(
              "validation_profile_sketch_hole",
              "Sketch profile hole must not be empty"
            );
          }
          for (const id of loopIds) {
            deps.ensureNonEmptyString(
              id,
              "validation_profile_sketch_hole_id",
              "Sketch profile hole id must be a string"
            );
          }
        }
      }
      return;
    }
    default:
      throw new CompileError(
        "validation_profile_kind",
        `Unknown profile kind ${String((profile as { kind?: string }).kind)}`
      );
  }
}

function validateSketchProfileLoopIds(
  ids: ID[],
  entityMap: Map<ID, SketchEntity>,
  uniqueIds: Set<ID> | undefined,
  label: "loop" | "hole"
): void {
  for (const id of ids) {
    if (uniqueIds) {
      if (uniqueIds.has(id)) {
        throw new CompileError(
          "validation_sketch_profile_duplicate",
          `profile.sketch loop id ${id} is duplicated`
        );
      }
      uniqueIds.add(id);
    }
    const entity = entityMap.get(id);
    if (!entity) {
      throw new CompileError(
        "validation_sketch_profile_missing_entity",
        `profile.sketch ${label} references missing entity ${id}`
      );
    }
    if (entity.construction) {
      throw new CompileError(
        "validation_sketch_profile_construction",
        `profile.sketch entity ${id} is marked construction`
      );
    }
    switch (entity.kind) {
      case "sketch.line":
      case "sketch.arc":
      case "sketch.circle":
      case "sketch.ellipse":
      case "sketch.rectangle":
      case "sketch.slot":
      case "sketch.polygon":
      case "sketch.spline":
        break;
      default:
        throw new CompileError(
          "validation_sketch_profile_entity_kind",
          `profile.sketch entity ${id} kind ${entity.kind} is not supported`
        );
    }
  }
}

function validateSketchConstraintAngle(
  deps: Pick<SketchValidationDeps, "validateNonNegativeScalar" | "scalarLiteral">,
  value: Scalar
): void {
  deps.validateNonNegativeScalar(value, "Sketch angle constraint");
  const literal = deps.scalarLiteral(value);
  if (literal !== null && literal > 180) {
    throw new CompileError(
      "validation_sketch_constraint_angle_range",
      "Sketch angle constraint must be between 0 and 180 degrees"
    );
  }
}

function validateSketchConstraintPointRef(
  deps: Pick<SketchValidationDeps, "ensureObject" | "ensureNonEmptyString">,
  ref: SketchConstraintPointRef,
  label: string
): void {
  deps.ensureObject(ref, "validation_sketch_constraint_ref", `${label} must be an object`);
  deps.ensureNonEmptyString(
    ref.entity,
    "validation_sketch_constraint_ref_entity",
    `${label} entity is required`
  );
  if (ref.handle === undefined) return;
  if (
    ref.handle !== "start" &&
    ref.handle !== "end" &&
    ref.handle !== "center" &&
    ref.handle !== "point" &&
    ref.handle !== "corner"
  ) {
    throw new CompileError(
      "validation_sketch_constraint_ref_handle",
      `${label} handle ${String(ref.handle)} is not supported`
    );
  }
}
