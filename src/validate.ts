import {
  AxisDirection,
  BuildContext,
  Expr,
  ID,
  IntentAssembly,
  IntentDocument,
  IntentFeature,
  IntentPart,
  AssemblyInstance,
  AssemblyMate,
  AssemblyOutput,
  AssemblyRef,
  ParamDef,
  ParamType,
  PatternRef,
  Point2D,
  Predicate,
  Profile,
  ProfileRef,
  RankRule,
  Scalar,
  Selector,
  SketchEntity,
  SketchProfile,
  Transform,
  Unit,
} from "./dsl.js";
import { CompileError } from "./errors.js";

export type ValidationMode = "strict" | "none";
export type ValidationOptions = { validate?: ValidationMode };

const AXIS_DIRECTIONS = new Set<AxisDirection>([
  "+X",
  "-X",
  "+Y",
  "-Y",
  "+Z",
  "-Z",
]);

const LENGTH_UNITS = new Set<Unit>(["mm", "cm", "m", "in"]);
const ANGLE_UNITS = new Set<Unit>(["rad", "deg"]);

export function shouldValidate(opts?: ValidationOptions): boolean {
  return opts?.validate !== "none";
}

export function validateDocument(doc: IntentDocument): void {
  ensureObject(doc, "validation_document", "Document must be an object");
  ensureNonEmptyString(doc.id, "validation_document_id", "Document id is required");
  const parts = ensureArray<IntentPart>(
    doc.parts,
    "validation_document_parts",
    "Document parts must be an array"
  );
  validateContext(doc.context);

  const partIds = new Set<ID>();
  for (const part of parts) {
    const id = ensureNonEmptyString(
      part?.id,
      "validation_part_id",
      "Part id is required"
    );
    if (partIds.has(id)) {
      throw new CompileError(
        "validation_part_duplicate",
        `Duplicate part id ${id}`
      );
    }
    partIds.add(id);
  }

  if (doc.assemblies !== undefined) {
    const assemblies = ensureArray<IntentAssembly>(
      doc.assemblies,
      "validation_document_assemblies",
      "Document assemblies must be an array"
    );
    for (const assembly of assemblies) {
      validateAssembly(assembly, partIds);
    }
  }
}

export function validatePart(part: IntentPart): void {
  ensureObject(part, "validation_part", "Part must be an object");
  ensureNonEmptyString(part.id, "validation_part_id", "Part id is required");
  const features = ensureArray<IntentFeature>(
    part.features,
    "validation_part_features",
    "Part features must be an array"
  );

  const featureIds = new Set<ID>();
  for (const feature of features) {
    const id = ensureNonEmptyString(
      (feature as { id?: ID })?.id,
      "validation_feature_id",
      "Feature id is required"
    );
    if (featureIds.has(id)) {
      throw new CompileError(
        "validation_feature_duplicate",
        `Duplicate feature id ${id}`
      );
    }
    featureIds.add(id);
    validateFeature(feature);
  }

  if (part.params !== undefined) {
    const params = ensureArray<ParamDef>(
      part.params,
      "validation_part_params",
      "Part params must be an array"
    );
    const paramIds = new Set<ID>();
    for (const param of params) {
      validateParam(param);
      if (paramIds.has(param.id)) {
        throw new CompileError(
          "validation_param_duplicate",
          `Duplicate param id ${param.id}`
        );
      }
      paramIds.add(param.id);
    }
  }
}

function validateContext(ctx: BuildContext): void {
  ensureObject(ctx, "validation_context", "BuildContext must be an object");
  if (!LENGTH_UNITS.has(ctx.units as Unit)) {
    throw new CompileError(
      "validation_context_units",
      `Unsupported units ${String(ctx.units)}`
    );
  }
  ensureObject(ctx.kernel, "validation_context_kernel", "Kernel config is required");
  ensureNonEmptyString(
    ctx.kernel.name,
    "validation_context_kernel_name",
    "Kernel name is required"
  );
  ensureNonEmptyString(
    ctx.kernel.version,
    "validation_context_kernel_version",
    "Kernel version is required"
  );
  ensureObject(
    ctx.tolerance,
    "validation_context_tolerance",
    "Tolerance config is required"
  );
  ensureFiniteNumber(
    ctx.tolerance.linear,
    "validation_context_tolerance_linear",
    "Tolerance linear must be a number"
  );
  ensureFiniteNumber(
    ctx.tolerance.angular,
    "validation_context_tolerance_angular",
    "Tolerance angular must be a number"
  );
  if (ctx.tolerance.linear < 0 || ctx.tolerance.angular < 0) {
    throw new CompileError(
      "validation_context_tolerance_range",
      "Tolerance values must be non-negative"
    );
  }
}

function validateAssembly(assembly: IntentAssembly, partIds: Set<ID>): void {
  ensureObject(assembly, "validation_assembly", "Assembly must be an object");
  ensureNonEmptyString(
    assembly.id,
    "validation_assembly_id",
    "Assembly id is required"
  );

  const instanceIds = new Set<ID>();
  const instances = ensureArray<AssemblyInstance>(
    assembly.instances,
    "validation_assembly_instances",
    "Assembly instances must be an array"
  );
  for (const instance of instances) {
    const id = ensureNonEmptyString(
      instance?.id,
      "validation_assembly_instance_id",
      "Assembly instance id is required"
    );
    if (instanceIds.has(id)) {
      throw new CompileError(
        "validation_assembly_instance_duplicate",
        `Duplicate assembly instance id ${id}`
      );
    }
    instanceIds.add(id);
    ensureNonEmptyString(
      instance.part,
      "validation_assembly_instance_part",
      "Assembly instance part is required"
    );
    if (!partIds.has(instance.part)) {
      throw new CompileError(
        "validation_assembly_instance_part_missing",
        `Assembly instance ${instance.id} references missing part ${instance.part}`
      );
    }
    if (instance.transform !== undefined) {
      validateTransform(instance.transform);
    }
    if (instance.tags !== undefined) {
      const tags = ensureArray<string>(
        instance.tags,
        "validation_assembly_instance_tags",
        "Assembly instance tags must be an array"
      );
      for (const tag of tags) {
        ensureNonEmptyString(
          tag,
          "validation_assembly_instance_tag",
          "Assembly instance tag must be a string"
        );
      }
    }
  }

  if (assembly.mates !== undefined) {
    const mates = ensureArray<AssemblyMate>(
      assembly.mates,
      "validation_assembly_mates",
      "Assembly mates must be an array"
    );
    for (const mate of mates) {
      ensureObject(mate, "validation_assembly_mate", "Mate must be an object");
      const kind = (mate as { kind?: string }).kind;
      if (kind === "mate.fixed" || kind === "mate.coaxial") {
        validateAssemblyRef((mate as { a: any }).a, instanceIds);
        validateAssemblyRef((mate as { b: any }).b, instanceIds);
        continue;
      }
      if (kind === "mate.planar") {
        validateAssemblyRef((mate as { a: any }).a, instanceIds);
        validateAssemblyRef((mate as { b: any }).b, instanceIds);
        const offset = (mate as { offset?: unknown }).offset;
        if (offset !== undefined) {
          ensureFiniteNumber(
            offset as number,
            "validation_assembly_mate_offset",
            "Mate offset must be a number"
          );
        }
        continue;
      }
      throw new CompileError(
        "validation_assembly_mate_kind",
        `Unknown mate kind ${String(kind)}`
      );
    }
  }

  if (assembly.outputs !== undefined) {
    const outputs = ensureArray<AssemblyOutput>(
      assembly.outputs,
      "validation_assembly_outputs",
      "Assembly outputs must be an array"
    );
    for (const output of outputs) {
      ensureNonEmptyString(
        output?.name,
        "validation_assembly_output_name",
        "Assembly output name is required"
      );
      const refs = ensureArray<AssemblyRef>(
        output.refs,
        "validation_assembly_output_refs",
        "Assembly output refs must be an array"
      );
      for (const ref of refs) {
        validateAssemblyRef(ref, instanceIds);
      }
    }
  }
}

function validateAssemblyRef(ref: unknown, instanceIds: Set<ID>): void {
  ensureObject(ref, "validation_assembly_ref", "Assembly ref must be an object");
  const instance = ensureNonEmptyString(
    (ref as { instance?: ID }).instance,
    "validation_assembly_ref_instance",
    "Assembly ref instance is required"
  );
  if (!instanceIds.has(instance)) {
    throw new CompileError(
      "validation_assembly_ref_instance_missing",
      `Assembly ref references missing instance ${instance}`
    );
  }
  validateSelector((ref as { selector?: Selector }).selector);
}

function validateTransform(transform: Transform): void {
  ensureObject(transform, "validation_transform", "Transform must be an object");
  if (transform.translation !== undefined) {
    validatePoint3(
      transform.translation,
      "validation_transform_translation",
      "Transform translation must be a 3D vector"
    );
  }
  if (transform.rotation !== undefined) {
    validatePoint3(
      transform.rotation,
      "validation_transform_rotation",
      "Transform rotation must be a 3D vector"
    );
  }
  if (transform.matrix !== undefined) {
    const matrix = ensureArray<number>(
      transform.matrix,
      "validation_transform_matrix",
      "Transform matrix must be an array"
    );
    if (matrix.length !== 16) {
      throw new CompileError(
        "validation_transform_matrix_length",
        "Transform matrix must be length 16"
      );
    }
    for (const value of matrix) {
      ensureFiniteNumber(
        value,
        "validation_transform_matrix_value",
        "Transform matrix entries must be numbers"
      );
    }
  }
}

function validateParam(param: ParamDef): void {
  ensureObject(param, "validation_param", "Param must be an object");
  ensureNonEmptyString(param.id, "validation_param_id", "Param id is required");
  if (!isParamType(param.type)) {
    throw new CompileError(
      "validation_param_type",
      `Unknown param type ${String(param.type)}`
    );
  }
  validateExpr(param.value, "Param value");
}

function validateFeature(feature: IntentFeature): void {
  ensureObject(feature, "validation_feature", "Feature must be an object");
  const kind = (feature as { kind?: string }).kind;
  ensureNonEmptyString(kind, "validation_feature_kind", "Feature kind is required");

  if (feature.deps !== undefined) {
    const deps = ensureArray<ID>(
      feature.deps,
      "validation_feature_deps",
      "Feature deps must be an array"
    );
    for (const dep of deps) {
      ensureNonEmptyString(
        dep,
        "validation_feature_dep",
        "Feature dep must be a string"
      );
    }
  }

  switch (kind) {
    case "datum.plane": {
      const normal = (feature as { normal?: AxisDirection }).normal;
      ensureAxis(normal, "Datum plane normal is required");
      const origin = (feature as { origin?: unknown }).origin;
      if (origin !== undefined) {
        validatePoint3(origin as number[], "validation_datum_origin", "Datum origin invalid");
      }
      return;
    }
    case "datum.axis": {
      const direction = (feature as { direction?: AxisDirection }).direction;
      ensureAxis(direction, "Datum axis direction is required");
      const origin = (feature as { origin?: unknown }).origin;
      if (origin !== undefined) {
        validatePoint3(origin as number[], "validation_datum_origin", "Datum origin invalid");
      }
      return;
    }
    case "datum.frame": {
      validateSelector((feature as { on?: Selector }).on);
      return;
    }
    case "feature.sketch2d": {
      const sketch = feature as { profiles?: SketchProfile[]; plane?: Selector; entities?: SketchEntity[] };
      const profiles = ensureArray<SketchProfile>(
        sketch.profiles,
        "validation_sketch_profiles",
        "Sketch profiles must be an array"
      );
      for (const profile of profiles) {
        validateSketchProfile(profile);
      }
      if (sketch.plane !== undefined) {
        validateSelector(sketch.plane);
      }
      if (sketch.entities !== undefined) {
        const entities = ensureArray<SketchEntity>(
          sketch.entities,
          "validation_sketch_entities",
          "Sketch entities must be an array"
        );
        for (const entity of entities) {
          validateSketchEntity(entity);
        }
      }
      return;
    }
    case "feature.extrude": {
      const extrude = feature as { profile?: ProfileRef; depth?: Scalar | "throughAll"; result?: string };
      validateProfileRef(extrude.profile);
      validateDepth(extrude.depth);
      ensureNonEmptyString(
        extrude.result,
        "validation_feature_result",
        "Extrude result is required"
      );
      return;
    }
    case "feature.revolve": {
      const revolve = feature as {
        profile?: ProfileRef;
        axis?: AxisDirection;
        angle?: Scalar | "full";
        result?: string;
        origin?: unknown;
      };
      validateProfileRef(revolve.profile);
      ensureAxis(revolve.axis, "Revolve axis is required");
      if (revolve.angle !== undefined && revolve.angle !== "full") {
        validateScalar(revolve.angle, "Revolve angle");
      }
      if (revolve.origin !== undefined) {
        validatePoint3(
          revolve.origin as number[],
          "validation_revolve_origin",
          "Revolve origin must be a 3D point"
        );
      }
      ensureNonEmptyString(
        revolve.result,
        "validation_feature_result",
        "Revolve result is required"
      );
      return;
    }
    case "feature.hole": {
      const hole = feature as {
        onFace?: Selector;
        axis?: AxisDirection;
        diameter?: Scalar;
        depth?: Scalar | "throughAll";
        pattern?: PatternRef;
      };
      validateSelector(hole.onFace);
      ensureAxis(hole.axis, "Hole axis is required");
      validateScalar(hole.diameter, "Hole diameter");
      validateDepth(hole.depth);
      if (hole.pattern !== undefined) {
        validatePatternRef(hole.pattern);
      }
      return;
    }
    case "feature.fillet": {
      const fillet = feature as { edges?: Selector; radius?: Scalar };
      validateSelector(fillet.edges);
      validateScalar(fillet.radius, "Fillet radius");
      return;
    }
    case "feature.chamfer": {
      const chamfer = feature as { edges?: Selector; distance?: Scalar };
      validateSelector(chamfer.edges);
      validateScalar(chamfer.distance, "Chamfer distance");
      return;
    }
    case "feature.boolean": {
      const boolOp = feature as {
        op?: string;
        left?: Selector;
        right?: Selector;
        result?: string;
      };
      if (boolOp.op !== "union" && boolOp.op !== "subtract" && boolOp.op !== "intersect") {
        throw new CompileError(
          "validation_boolean_op",
          `Unknown boolean op ${String(boolOp.op)}`
        );
      }
      validateSelector(boolOp.left);
      validateSelector(boolOp.right);
      ensureNonEmptyString(
        boolOp.result,
        "validation_feature_result",
        "Boolean result is required"
      );
      return;
    }
    case "pattern.linear": {
      const pattern = feature as {
        origin?: Selector;
        spacing?: [Scalar, Scalar];
        count?: [Scalar, Scalar];
      };
      validateSelector(pattern.origin);
      ensureTuple2(pattern.spacing, "Pattern spacing");
      validateScalar(pattern.spacing?.[0], "Pattern spacing X");
      validateScalar(pattern.spacing?.[1], "Pattern spacing Y");
      ensureTuple2(pattern.count, "Pattern count");
      validateScalar(pattern.count?.[0], "Pattern count X");
      validateScalar(pattern.count?.[1], "Pattern count Y");
      return;
    }
    case "pattern.circular": {
      const pattern = feature as {
        origin?: Selector;
        axis?: AxisDirection;
        count?: Scalar;
      };
      validateSelector(pattern.origin);
      ensureAxis(pattern.axis, "Pattern axis is required");
      validateScalar(pattern.count, "Pattern count");
      return;
    }
    default:
      throw new CompileError(
        "validation_feature_kind",
        `Unknown feature kind ${String(kind)}`
      );
  }
}

function validateSketchProfile(profile: SketchProfile): void {
  ensureObject(profile, "validation_profile", "Sketch profile must be an object");
  ensureNonEmptyString(
    profile.name,
    "validation_profile_name",
    "Sketch profile name is required"
  );
  validateProfile(profile.profile);
}

function validateSketchEntity(entity: SketchEntity): void {
  ensureObject(entity, "validation_sketch_entity", "Sketch entity must be an object");
  ensureNonEmptyString(
    entity.id,
    "validation_sketch_entity_id",
    "Sketch entity id is required"
  );

  switch (entity.kind) {
    case "sketch.line":
      validatePoint2(entity.start, "Sketch line start");
      validatePoint2(entity.end, "Sketch line end");
      return;
    case "sketch.arc":
      validatePoint2(entity.start, "Sketch arc start");
      validatePoint2(entity.end, "Sketch arc end");
      validatePoint2(entity.center, "Sketch arc center");
      if (entity.direction !== "cw" && entity.direction !== "ccw") {
        throw new CompileError(
          "validation_sketch_arc_direction",
          `Unknown arc direction ${String(entity.direction)}`
        );
      }
      return;
    case "sketch.circle":
      validatePoint2(entity.center, "Sketch circle center");
      validateScalar(entity.radius, "Sketch circle radius");
      return;
    case "sketch.ellipse":
      validatePoint2(entity.center, "Sketch ellipse center");
      validateScalar(entity.radiusX, "Sketch ellipse radiusX");
      validateScalar(entity.radiusY, "Sketch ellipse radiusY");
      if (entity.rotation !== undefined) {
        validateScalar(entity.rotation, "Sketch ellipse rotation");
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
        validatePoint2(rect.center, "Sketch rectangle center");
      } else {
        if (!rect.corner) {
          throw new CompileError(
            "validation_sketch_rect_corner",
            "Sketch rectangle corner is required"
          );
        }
        validatePoint2(rect.corner, "Sketch rectangle corner");
      }
      validateScalar(rect.width, "Sketch rectangle width");
      validateScalar(rect.height, "Sketch rectangle height");
      if (rect.rotation !== undefined) {
        validateScalar(rect.rotation, "Sketch rectangle rotation");
      }
      return;
    }
    case "sketch.slot":
      validatePoint2(entity.center, "Sketch slot center");
      validateScalar(entity.length, "Sketch slot length");
      validateScalar(entity.width, "Sketch slot width");
      if (entity.rotation !== undefined) {
        validateScalar(entity.rotation, "Sketch slot rotation");
      }
      if (entity.endStyle !== undefined) {
        if (entity.endStyle !== "arc" && entity.endStyle !== "straight") {
          throw new CompileError(
            "validation_sketch_slot_endstyle",
            `Unknown slot end style ${String(entity.endStyle)}`
          );
        }
      }
      return;
    case "sketch.polygon":
      validatePoint2(entity.center, "Sketch polygon center");
      validateScalar(entity.radius, "Sketch polygon radius");
      validateScalar(entity.sides, "Sketch polygon sides");
      if (entity.rotation !== undefined) {
        validateScalar(entity.rotation, "Sketch polygon rotation");
      }
      return;
    case "sketch.spline":
      const points = ensureArray<Point2D>(
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
      for (const point of points) {
        validatePoint2(point, "Sketch spline point");
      }
      if (entity.degree !== undefined) {
        validateScalar(entity.degree, "Sketch spline degree");
      }
      return;
    case "sketch.point":
      validatePoint2(entity.point, "Sketch point");
      return;
    default:
      throw new CompileError(
        "validation_sketch_entity_kind",
        `Unknown sketch entity kind ${String((entity as { kind?: string }).kind)}`
      );
  }
}

function validateProfileRef(profile: ProfileRef | undefined): void {
  if (!profile) {
    throw new CompileError(
      "validation_profile_ref",
      "Profile reference is required"
    );
  }
  if ((profile as { kind?: string }).kind === "profile.ref") {
    const name = (profile as { name?: string }).name;
    ensureNonEmptyString(
      name,
      "validation_profile_ref_name",
      "Profile ref name is required"
    );
    return;
  }
  validateProfile(profile as Profile);
}

function validateProfile(profile: Profile): void {
  ensureObject(profile, "validation_profile", "Profile must be an object");
  switch (profile.kind) {
    case "profile.rectangle":
      validateScalar(profile.width, "Profile width");
      validateScalar(profile.height, "Profile height");
      if (profile.center !== undefined) {
        validatePoint3(
          profile.center,
          "validation_profile_center",
          "Profile center must be a 3D point"
        );
      }
      return;
    case "profile.circle":
      validateScalar(profile.radius, "Profile radius");
      if (profile.center !== undefined) {
        validatePoint3(
          profile.center,
          "validation_profile_center",
          "Profile center must be a 3D point"
        );
      }
      return;
    default:
      throw new CompileError(
        "validation_profile_kind",
        `Unknown profile kind ${String((profile as { kind?: string }).kind)}`
      );
  }
}

function validatePatternRef(pattern: PatternRef): void {
  ensureObject(pattern, "validation_pattern_ref", "Pattern ref must be an object");
  const kind = (pattern as { kind?: string }).kind;
  if (kind !== "pattern.linear" && kind !== "pattern.circular") {
    throw new CompileError(
      "validation_pattern_ref_kind",
      `Unknown pattern ref kind ${String(kind)}`
    );
  }
  ensureNonEmptyString(
    (pattern as { ref?: string }).ref,
    "validation_pattern_ref_id",
    "Pattern ref id is required"
  );
}

function validateDepth(depth: Scalar | "throughAll" | undefined): void {
  if (depth === "throughAll") return;
  validateScalar(depth, "Feature depth");
}

function validateSelector(selector: Selector | undefined): void {
  if (!selector) {
    throw new CompileError(
      "validation_selector",
      "Selector is required"
    );
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
    for (const predicate of predicates) {
      validatePredicate(predicate);
    }
    for (const rule of rank) {
      validateRankRule(rule);
    }
    return;
  }

  throw new CompileError(
    "validation_selector_kind",
    `Unknown selector kind ${String(kind)}`
  );
}

function validatePredicate(predicate: Predicate): void {
  ensureObject(predicate, "validation_predicate", "Predicate must be an object");
  switch (predicate.kind) {
    case "pred.normal":
      ensureAxis(
        predicate.value,
        "Predicate normal axis is required"
      );
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

function validateRankRule(rule: RankRule): void {
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

function validateScalar(value: Scalar | undefined, label: string): void {
  if (value === undefined) {
    throw new CompileError(
      "validation_scalar",
      `${label} is required`
    );
  }
  if (typeof value === "number") {
    ensureFiniteNumber(value, "validation_scalar", `${label} must be a number`);
    return;
  }
  validateExpr(value, label);
}

function validateExpr(expr: Expr, label: string): void {
  ensureObject(expr, "validation_expr", `${label} must be an expression`);
  switch (expr.kind) {
    case "expr.literal":
      ensureFiniteNumber(
        expr.value,
        "validation_expr_literal",
        `${label} literal must be a number`
      );
      if (expr.unit !== undefined) {
        ensureUnit(expr.unit);
      }
      return;
    case "expr.param":
      ensureNonEmptyString(
        expr.id,
        "validation_expr_param",
        `${label} param id is required`
      );
      return;
    case "expr.binary":
      if (expr.op !== "+" && expr.op !== "-" && expr.op !== "*" && expr.op !== "/") {
        throw new CompileError(
          "validation_expr_op",
          `Unknown expr op ${String(expr.op)}`
        );
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

function validatePoint2(point: unknown, label: string): void {
  const coords = ensureArray<Scalar>(
    point,
    "validation_point2",
    `${label} must be a 2D point`
  );
  if (coords.length !== 2) {
    throw new CompileError(
      "validation_point2_length",
      `${label} must have 2 entries`
    );
  }
  validateScalar(coords[0], label);
  validateScalar(coords[1], label);
}

function validatePoint3(value: unknown, code: string, message: string): void {
  const point = ensureArray<number>(value, code, message);
  if (point.length !== 3) {
    throw new CompileError(code, message);
  }
  for (const entry of point) {
    ensureFiniteNumber(entry, code, message);
  }
}

function ensureAxis(value: AxisDirection | undefined, message: string): void {
  if (!value || !AXIS_DIRECTIONS.has(value)) {
    throw new CompileError("validation_axis", message);
  }
}

function ensureUnit(value: Unit): void {
  if (!LENGTH_UNITS.has(value) && !ANGLE_UNITS.has(value)) {
    throw new CompileError(
      "validation_unit",
      `Unknown unit ${String(value)}`
    );
  }
}

function ensureTuple2(
  value: [unknown, unknown] | undefined,
  label: string
): void {
  if (!value || !Array.isArray(value) || value.length !== 2) {
    throw new CompileError(
      "validation_tuple2",
      `${label} must be a tuple of length 2`
    );
  }
}

function ensureObject(value: unknown, code: string, message: string): void {
  if (!value || typeof value !== "object") {
    throw new CompileError(code, message);
  }
}

function ensureArray<T>(value: unknown, code: string, message: string): T[] {
  if (!Array.isArray(value)) {
    throw new CompileError(code, message);
  }
  return value as T[];
}

function ensureNonEmptyString(value: unknown, code: string, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CompileError(code, message);
  }
  return value;
}

function ensureFiniteNumber(value: unknown, code: string, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CompileError(code, message);
  }
}

function isParamType(value: ParamType): boolean {
  return value === "length" || value === "angle" || value === "count";
}
