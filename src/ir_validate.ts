import {
  AxisDirection,
  AxisSpec,
  BuildContext,
  CosmeticThread,
  DatumModifier,
  DatumRef,
  DimensionAngle,
  DimensionDistance,
  ExtrudeAxis,
  Expr,
  FTIConstraint,
  FTIDatum,
  FlatnessConstraint,
  GeometryRef,
  ID,
  IntentAssembly,
  IntentAssertion,
  IntentDocument,
  IntentFeature,
  IntentPart,
  AssemblyInstance,
  AssemblyMate,
  AssemblyOutput,
  AssemblyRef,
  MateConnector,
  ParamDef,
  ParamType,
  ParallelismConstraint,
  PatternRef,
  Path3D,
  PathSegment,
  PerpendicularityConstraint,
  Point2D,
  Point3D,
  PlaneRef,
  PositionConstraint,
  Predicate,
  Profile,
  ProfileRef,
  RankRule,
  RefFrame,
  RefSurface,
  Scalar,
  Selector,
  SizeConstraint,
  SketchEntity,
  SketchProfile,
  Transform,
  ToleranceModifier,
  Unit,
  TF_IR_SCHEMA,
  TF_IR_VERSION,
} from "./ir.js";
import { CompileError } from "./errors.js";

export type ValidationMode = "strict" | "none";
export type StagedFeaturePolicy = "allow" | "warn" | "error";
export type ValidationOptions = {
  validate?: ValidationMode;
  stagedFeatures?: StagedFeaturePolicy;
};

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
const POSITION_ZONES = new Set<PositionConstraint["zone"]>([
  "diameter",
  "cartesian",
]);

export function shouldValidate(opts?: ValidationOptions): boolean {
  return opts?.validate !== "none";
}

export function validateDocument(doc: IntentDocument): void {
  ensureObject(doc, "validation_document", "Document must be an object");
  ensureNonEmptyString(doc.id, "validation_document_id", "Document id is required");
  if (doc.schema !== TF_IR_SCHEMA) {
    throw new CompileError(
      "validation_document_schema",
      `Unsupported IR schema ${String(doc.schema)}`
    );
  }
  if (doc.irVersion !== TF_IR_VERSION) {
    throw new CompileError(
      "validation_document_ir_version",
      `Unsupported IR version ${String(doc.irVersion)}`
    );
  }
  const parts = ensureArray<IntentPart>(
    doc.parts,
    "validation_document_parts",
    "Document parts must be an array"
  );
  validateContext(doc.context);

  const partIds = new Set<ID>();
  const connectorIdsByPart = new Map<ID, Set<ID>>();
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
    if (part.connectors) {
      const ids = new Set<ID>();
      for (const connector of part.connectors) {
        if (connector && typeof connector.id === "string") {
          ids.add(connector.id);
        }
      }
      connectorIdsByPart.set(id, ids);
    }
  }

  if (doc.assemblies !== undefined) {
    const assemblies = ensureArray<IntentAssembly>(
      doc.assemblies,
      "validation_document_assemblies",
      "Document assemblies must be an array"
    );
    for (const assembly of assemblies) {
      validateAssembly(assembly, partIds, connectorIdsByPart);
    }
  }

  if (doc.assertions !== undefined) {
    const assertions = ensureArray<IntentAssertion>(
      doc.assertions,
      "validation_document_assertions",
      "Document assertions must be an array"
    );
    for (const assertion of assertions) validateAssertion(assertion);
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

  if (part.connectors !== undefined) {
    const connectors = ensureArray<MateConnector>(
      part.connectors,
      "validation_part_connectors",
      "Part connectors must be an array"
    );
    const connectorIds = new Set<ID>();
    for (const connector of connectors) {
      validateConnector(connector);
      if (connectorIds.has(connector.id)) {
        throw new CompileError(
          "validation_connector_duplicate",
          `Duplicate connector id ${connector.id}`
        );
      }
      if (featureIds.has(connector.id)) {
        throw new CompileError(
          "validation_connector_conflict",
          `Connector id ${connector.id} conflicts with a feature id`
        );
      }
      connectorIds.add(connector.id);
    }
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

  const datumIds = new Set<ID>();
  const datumLabels = new Set<string>();
  if (part.datums !== undefined) {
    const datums = ensureArray<FTIDatum>(
      part.datums,
      "validation_part_datums",
      "Part datums must be an array"
    );
    for (const datum of datums) {
      validateDatum(datum);
      if (datumIds.has(datum.id)) {
        throw new CompileError(
          "validation_datum_duplicate",
          `Duplicate datum id ${datum.id}`
        );
      }
      if (datumLabels.has(datum.label)) {
        throw new CompileError(
          "validation_datum_label_duplicate",
          `Duplicate datum label ${datum.label}`
        );
      }
      datumIds.add(datum.id);
      datumLabels.add(datum.label);
    }
  }

  if (part.constraints !== undefined) {
    const constraints = ensureArray<FTIConstraint>(
      part.constraints,
      "validation_part_constraints",
      "Part constraints must be an array"
    );
    for (const constraint of constraints) {
      validateConstraint(constraint, datumIds);
    }
  }

  if (part.cosmeticThreads !== undefined) {
    const threads = ensureArray<CosmeticThread>(
      part.cosmeticThreads,
      "validation_part_cosmetic_threads",
      "Part cosmetic threads must be an array"
    );
    for (const thread of threads) {
      validateCosmeticThread(thread);
    }
  }

  if (part.assertions !== undefined) {
    const assertions = ensureArray<IntentAssertion>(
      part.assertions,
      "validation_part_assertions",
      "Part assertions must be an array"
    );
    for (const assertion of assertions) validateAssertion(assertion);
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

function validateAssembly(
  assembly: IntentAssembly,
  partIds: Set<ID>,
  connectorIdsByPart: Map<ID, Set<ID>>
): void {
  ensureObject(assembly, "validation_assembly", "Assembly must be an object");
  ensureNonEmptyString(
    assembly.id,
    "validation_assembly_id",
    "Assembly id is required"
  );

  const instanceIds = new Set<ID>();
  const instanceToPart = new Map<ID, ID>();
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
    instanceToPart.set(id, instance.part);
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
      const validateMateRefs = () => {
        validateAssemblyRef(
          (mate as { a: any }).a,
          instanceIds,
          instanceToPart,
          connectorIdsByPart
        );
        validateAssemblyRef(
          (mate as { b: any }).b,
          instanceIds,
          instanceToPart,
          connectorIdsByPart
        );
      };
      const validateOptionalNumber = (value: unknown, code: string, message: string) => {
        if (value === undefined) return;
        ensureFiniteNumber(value as number, code, message);
      };
      if (
        kind === "mate.fixed" ||
        kind === "mate.coaxial" ||
        kind === "mate.parallel" ||
        kind === "mate.perpendicular" ||
        kind === "mate.slider"
      ) {
        validateMateRefs();
        continue;
      }
      if (kind === "mate.planar" || kind === "mate.insert" || kind === "mate.hinge") {
        validateMateRefs();
        validateOptionalNumber(
          (mate as { offset?: unknown }).offset,
          "validation_assembly_mate_offset",
          "Mate offset must be a number"
        );
        continue;
      }
      if (kind === "mate.distance") {
        validateMateRefs();
        const distance = (mate as { distance?: unknown }).distance;
        validateOptionalNumber(
          distance,
          "validation_assembly_mate_distance",
          "Mate distance must be a number"
        );
        if (typeof distance === "number" && distance < 0) {
          throw new CompileError(
            "validation_assembly_mate_distance_range",
            "Mate distance must be non-negative"
          );
        }
        continue;
      }
      if (kind === "mate.angle") {
        validateMateRefs();
        validateOptionalNumber(
          (mate as { angle?: unknown }).angle,
          "validation_assembly_mate_angle",
          "Mate angle must be a number"
        );
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
        validateAssemblyRef(ref, instanceIds, instanceToPart, connectorIdsByPart);
      }
    }
  }
}

function validateAssemblyRef(
  ref: unknown,
  instanceIds: Set<ID>,
  instanceToPart: Map<ID, ID>,
  connectorIdsByPart: Map<ID, Set<ID>>
): void {
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
  const connector = ensureNonEmptyString(
    (ref as { connector?: ID }).connector,
    "validation_assembly_ref_connector",
    "Assembly ref connector is required"
  );
  const partId = instanceToPart.get(instance);
  if (!partId) {
    throw new CompileError(
      "validation_assembly_ref_instance_missing",
      `Assembly ref references missing instance ${instance}`
    );
  }
  const connectors = connectorIdsByPart.get(partId);
  if (!connectors || !connectors.has(connector)) {
    throw new CompileError(
      "validation_assembly_ref_connector_missing",
      `Assembly ref connector ${connector} not found on part ${partId}`
    );
  }
}

function validateConnector(connector: MateConnector): void {
  ensureObject(connector, "validation_connector", "Connector must be an object");
  ensureNonEmptyString(connector.id, "validation_connector_id", "Connector id is required");
  validateSelector(connector.origin);
  if (!selectorAnchored(connector.origin)) {
    throw new CompileError(
      "validation_connector_anchor",
      `Connector ${connector.id} origin selector must be anchored`
    );
  }
  if (connector.normal !== undefined) {
    ensureAxis(connector.normal, "Connector normal is invalid");
  }
  if (connector.xAxis !== undefined) {
    ensureAxis(connector.xAxis, "Connector xAxis is invalid");
  }
}

function selectorAnchored(selector: Selector): boolean {
  if (selector.kind === "selector.named") return true;
  for (const predicate of selector.predicates as Predicate[]) {
    if (predicate.kind === "pred.createdBy") return true;
  }
  for (const rule of selector.rank as RankRule[]) {
    if (rule.kind !== "rank.closestTo") continue;
    if (selectorAnchored(rule.target)) return true;
  }
  return false;
}

function validateTransform(transform: Transform): void {
  ensureObject(transform, "validation_transform", "Transform must be an object");
  if (transform.matrix !== undefined && (transform.translation || transform.rotation)) {
    throw new CompileError(
      "validation_transform_conflict",
      "Transform matrix cannot be combined with translation or rotation"
    );
  }
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
  const rawTags = (feature as { tags?: unknown }).tags;
  if (rawTags !== undefined) {
    const tags = ensureArray<string>(
      rawTags as string[],
      "validation_feature_tags",
      "Feature tags must be an array"
    );
    for (const tag of tags) {
      ensureNonEmptyString(
        tag,
        "validation_feature_tag",
        "Feature tag must be a string"
      );
    }
  }

  switch (kind) {
    case "datum.plane": {
      const datum = feature as { normal?: AxisSpec; origin?: unknown; xAxis?: AxisSpec };
      validateAxisSpec(datum.normal, "Datum plane normal is required");
      if (datum.origin !== undefined) {
        validatePoint3Scalar(datum.origin, "Datum plane origin");
      }
      if (datum.xAxis !== undefined) {
        validateAxisSpec(datum.xAxis, "Datum plane xAxis is invalid");
      }
      return;
    }
    case "datum.axis": {
      const datum = feature as { direction?: AxisSpec; origin?: unknown };
      validateAxisSpec(datum.direction, "Datum axis direction is required");
      if (datum.origin !== undefined) {
        validatePoint3Scalar(datum.origin, "Datum axis origin");
      }
      return;
    }
    case "datum.frame": {
      validateSelector((feature as { on?: Selector }).on);
      return;
    }
    case "feature.sketch2d": {
      const sketch = feature as { profiles?: SketchProfile[]; plane?: PlaneRef; entities?: SketchEntity[] };
      const profiles = ensureArray<SketchProfile>(
        sketch.profiles,
        "validation_sketch_profiles",
        "Sketch profiles must be an array"
      );
      const needsEntities = profiles.some(
        (profile) => profile.profile?.kind === "profile.sketch"
      );
      const entityMap = new Map<ID, SketchEntity>();
      if (sketch.entities !== undefined) {
        const entities = ensureArray<SketchEntity>(
          sketch.entities,
          "validation_sketch_entities",
          "Sketch entities must be an array"
        );
        for (const entity of entities) {
          validateSketchEntity(entity);
          if (entityMap.has(entity.id)) {
            throw new CompileError(
              "validation_sketch_entity_duplicate",
              `Duplicate sketch entity id ${entity.id}`
            );
          }
          entityMap.set(entity.id, entity);
        }
      } else if (needsEntities) {
        throw new CompileError(
          "validation_sketch_entities_required",
          "Sketch entities are required for profile.sketch"
        );
      }
      for (const profile of profiles) {
        validateSketchProfile(profile, entityMap);
      }
      if (sketch.plane !== undefined) {
        validatePlaneRef(sketch.plane, "Sketch plane");
      }
      return;
    }
    case "feature.extrude": {
      const extrude = feature as {
        profile?: ProfileRef;
        depth?: Scalar | "throughAll";
        result?: string;
        axis?: ExtrudeAxis;
        mode?: unknown;
      };
      validateProfileRef(extrude.profile);
      if (extrude.profile && (extrude.profile as Profile).kind === "profile.sketch") {
        throw new CompileError(
          "validation_profile_sketch_ref",
          "profile.sketch must be referenced from a sketch via profileRef"
        );
      }
      validateDepth(extrude.depth);
      if (extrude.axis !== undefined) {
        validateExtrudeAxis(extrude.axis, "Extrude axis is invalid");
      }
      if (extrude.mode !== undefined) {
        validateExtrudeMode(extrude.mode);
      }
      ensureNonEmptyString(
        extrude.result,
        "validation_feature_result",
        "Extrude result is required"
      );
      return;
    }
    case "feature.plane": {
      const plane = feature as {
        width?: Scalar;
        height?: Scalar;
        plane?: PlaneRef;
        origin?: unknown;
        result?: string;
      };
      validateScalar(plane.width, "Plane width is required");
      validateScalar(plane.height, "Plane height is required");
      if (typeof plane.width === "number" && plane.width <= 0) {
        throw new CompileError(
          "validation_plane_width_range",
          "Plane width must be greater than zero"
        );
      }
      if (typeof plane.height === "number" && plane.height <= 0) {
        throw new CompileError(
          "validation_plane_height_range",
          "Plane height must be greater than zero"
        );
      }
      if (plane.plane !== undefined) {
        validatePlaneRef(plane.plane, "Plane frame");
      }
      if (plane.origin !== undefined) {
        validatePoint3Scalar(plane.origin, "Plane origin");
      }
      ensureNonEmptyString(
        plane.result,
        "validation_feature_result",
        "Plane result is required"
      );
      return;
    }
    case "feature.surface": {
      const surface = feature as {
        profile?: ProfileRef;
        result?: string;
      };
      validateProfileRef(surface.profile);
      if (surface.profile && (surface.profile as Profile).kind === "profile.sketch") {
        throw new CompileError(
          "validation_profile_sketch_ref",
          "profile.sketch must be referenced from a sketch via profileRef"
        );
      }
      ensureNonEmptyString(
        surface.result,
        "validation_feature_result",
        "Surface result is required"
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
        mode?: unknown;
      };
      validateProfileRef(revolve.profile);
      if (revolve.profile && (revolve.profile as Profile).kind === "profile.sketch") {
        throw new CompileError(
          "validation_profile_sketch_ref",
          "profile.sketch must be referenced from a sketch via profileRef"
        );
      }
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
      if (revolve.mode !== undefined) {
        validateExtrudeMode(revolve.mode);
      }
      ensureNonEmptyString(
        revolve.result,
        "validation_feature_result",
        "Revolve result is required"
      );
      return;
    }
    case "feature.loft": {
      const loft = feature as {
        profiles?: ProfileRef[];
        result?: string;
        mode?: unknown;
      };
      const profiles = ensureArray<ProfileRef>(
        loft.profiles as ProfileRef[],
        "validation_loft_profiles",
        "Loft profiles must be an array"
      );
      if (profiles.length < 2) {
        throw new CompileError(
          "validation_loft_profiles",
          "Loft requires at least two profiles"
        );
      }
      for (const profile of profiles) {
        validateProfileRef(profile);
        if (profile && (profile as Profile).kind === "profile.sketch") {
          throw new CompileError(
            "validation_profile_sketch_ref",
            "profile.sketch must be referenced from a sketch via profileRef"
          );
        }
      }
      if (loft.mode !== undefined) {
        validateExtrudeMode(loft.mode);
      }
      ensureNonEmptyString(
        loft.result,
        "validation_feature_result",
        "Loft result is required"
      );
      return;
    }
    case "feature.sweep": {
      const sweep = feature as {
        profile?: ProfileRef;
        path?: Path3D;
        result?: string;
        mode?: unknown;
        frame?: PlaneRef;
        orientation?: unknown;
      };
      validateProfileRef(sweep.profile);
      if (sweep.profile && (sweep.profile as Profile).kind === "profile.sketch") {
        throw new CompileError(
          "validation_profile_sketch_ref",
          "profile.sketch must be referenced from a sketch via profileRef"
        );
      }
      validatePath3D(sweep.path, "Sweep path");
      if (sweep.frame !== undefined) {
        validatePlaneRef(sweep.frame, "Sweep frame");
      }
      if (sweep.mode !== undefined) {
        validateExtrudeMode(sweep.mode);
      }
      if (sweep.orientation !== undefined) {
        validateSweepOrientation(sweep.orientation);
      }
      if (sweep.frame !== undefined && sweep.orientation === "frenet") {
        throw new CompileError(
          "validation_sweep_orientation",
          "Sweep orientation cannot be \"frenet\" when a frame is provided"
        );
      }
      ensureNonEmptyString(
        sweep.result,
        "validation_feature_result",
        "Sweep result is required"
      );
      return;
    }
    case "feature.shell": {
      const shell = feature as {
        source?: Selector;
        thickness?: Scalar;
        direction?: unknown;
        openFaces?: Selector[];
        result?: string;
      };
      validateSelector(shell.source);
      validateScalar(shell.thickness, "Shell thickness");
      if (shell.direction !== undefined) {
        validateShellDirection(shell.direction);
      }
      if (shell.openFaces !== undefined) {
        if (!Array.isArray(shell.openFaces)) {
          throw new CompileError(
            "validation_shell_open_faces",
            "Shell openFaces must be an array"
          );
        }
        for (const face of shell.openFaces) {
          validateSelector(face);
        }
      }
      ensureNonEmptyString(
        shell.result,
        "validation_feature_result",
        "Shell result is required"
      );
      return;
    }
    case "feature.draft": {
      const draft = feature as {
        source?: Selector;
        faces?: Selector;
        neutralPlane?: PlaneRef;
        pullDirection?: AxisSpec;
        angle?: Scalar;
        result?: string;
      };
      validateSelector(draft.source);
      validateSelector(draft.faces);
      validatePlaneRef(
        draft.neutralPlane as PlaneRef,
        "Draft neutral plane is required"
      );
      validateAxisSpec(draft.pullDirection, "Draft pull direction is required");
      validateScalar(draft.angle, "Draft angle");
      ensureNonEmptyString(
        draft.result,
        "validation_feature_result",
        "Draft result is required"
      );
      return;
    }
    case "feature.pipe": {
      const pipe = feature as {
        axis?: AxisDirection;
        origin?: unknown;
        length?: Scalar;
        outerDiameter?: Scalar;
        innerDiameter?: Scalar;
        result?: string;
      };
      ensureAxis(pipe.axis, "Pipe axis is required");
      if (pipe.origin !== undefined) {
        validatePoint3Scalar(pipe.origin, "Pipe origin");
      }
      validateScalar(pipe.length, "Pipe length");
      validateScalar(pipe.outerDiameter, "Pipe outer diameter");
      if (pipe.innerDiameter !== undefined) {
        validateScalar(pipe.innerDiameter, "Pipe inner diameter");
      }
      ensureNonEmptyString(
        pipe.result,
        "validation_feature_result",
        "Pipe result is required"
      );
      return;
    }
    case "feature.pipeSweep": {
      const sweep = feature as {
        path?: Path3D;
        outerDiameter?: Scalar;
        innerDiameter?: Scalar;
        result?: string;
        mode?: unknown;
      };
      validatePath3D(sweep.path, "Pipe sweep path");
      validateScalar(sweep.outerDiameter, "Pipe sweep outer diameter");
      if (sweep.innerDiameter !== undefined) {
        validateScalar(sweep.innerDiameter, "Pipe sweep inner diameter");
      }
      if (sweep.mode !== undefined) {
        validateExtrudeMode(sweep.mode);
      }
      ensureNonEmptyString(
        sweep.result,
        "validation_feature_result",
        "Pipe sweep result is required"
      );
      return;
    }
    case "feature.hexTubeSweep": {
      const sweep = feature as {
        path?: Path3D;
        outerAcrossFlats?: Scalar;
        innerAcrossFlats?: Scalar;
        result?: string;
        mode?: unknown;
      };
      validatePath3D(sweep.path, "Hex tube sweep path");
      validateScalar(sweep.outerAcrossFlats, "Hex tube sweep outer across flats");
      if (sweep.innerAcrossFlats !== undefined) {
        validateScalar(sweep.innerAcrossFlats, "Hex tube sweep inner across flats");
      }
      if (sweep.mode !== undefined) {
        validateExtrudeMode(sweep.mode);
      }
      ensureNonEmptyString(
        sweep.result,
        "validation_feature_result",
        "Hex tube sweep result is required"
      );
      return;
    }
    case "feature.mirror": {
      const mirror = feature as { source?: Selector; plane?: PlaneRef; result?: string };
      validateSelector(mirror.source);
      validatePlaneRef(mirror.plane as PlaneRef, "Mirror plane");
      ensureNonEmptyString(
        mirror.result,
        "validation_feature_result",
        "Mirror result is required"
      );
      return;
    }
    case "feature.thicken": {
      const thicken = feature as {
        surface?: Selector;
        thickness?: Scalar;
        direction?: unknown;
        result?: string;
      };
      validateSelector(thicken.surface);
      validateScalar(thicken.thickness, "Thicken thickness");
      if (thicken.direction !== undefined) {
        validateThickenDirection(thicken.direction);
      }
      ensureNonEmptyString(
        thicken.result,
        "validation_feature_result",
        "Thicken result is required"
      );
      return;
    }
    case "feature.thread": {
      const thread = feature as {
        axis?: AxisSpec;
        origin?: unknown;
        length?: Scalar;
        majorDiameter?: Scalar;
        minorDiameter?: Scalar;
        pitch?: Scalar;
        handedness?: unknown;
        segmentsPerTurn?: Scalar;
        profileAngle?: Scalar;
        crestFlat?: Scalar;
        rootFlat?: Scalar;
        result?: string;
      };
      validateAxisSpec(thread.axis, "Thread axis is required");
      if (thread.origin !== undefined) {
        validatePoint3Scalar(thread.origin, "Thread origin");
      }
      validateScalar(thread.length, "Thread length");
      validateScalar(thread.majorDiameter, "Thread major diameter");
      if (thread.minorDiameter !== undefined) {
        validateScalar(thread.minorDiameter, "Thread minor diameter");
      }
      validateScalar(thread.pitch, "Thread pitch");
      if (thread.handedness !== undefined) {
        validateThreadHandedness(thread.handedness);
      }
      if (thread.segmentsPerTurn !== undefined) {
        validateScalar(thread.segmentsPerTurn, "Thread segments per turn");
      }
      if (thread.profileAngle !== undefined) {
        validateScalar(thread.profileAngle, "Thread profile angle");
      }
      if (thread.crestFlat !== undefined) {
        validateScalar(thread.crestFlat, "Thread crest flat");
      }
      if (thread.rootFlat !== undefined) {
        validateScalar(thread.rootFlat, "Thread root flat");
      }
      ensureNonEmptyString(
        thread.result,
        "validation_feature_result",
        "Thread result is required"
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
        position?: Point2D;
        counterbore?: { diameter?: Scalar; depth?: Scalar };
        countersink?: { diameter?: Scalar; angle?: Scalar };
      };
      validateSelector(hole.onFace);
      ensureAxis(hole.axis, "Hole axis is required");
      validateScalar(hole.diameter, "Hole diameter");
      validateDepth(hole.depth);
      if (hole.pattern !== undefined) {
        validatePatternRef(hole.pattern);
      }
      if (hole.position !== undefined) {
        validatePoint2(hole.position, "Hole position");
      }
      if (hole.counterbore !== undefined && hole.countersink !== undefined) {
        throw new CompileError(
          "validation_hole_counterbore_countersink",
          "Hole cannot define both counterbore and countersink"
        );
      }
      if (hole.counterbore !== undefined) {
        ensureObject(
          hole.counterbore,
          "validation_hole_counterbore",
          "Hole counterbore must be an object"
        );
        validateScalar(hole.counterbore.diameter, "Hole counterbore diameter");
        validateScalar(hole.counterbore.depth, "Hole counterbore depth");
      }
      if (hole.countersink !== undefined) {
        ensureObject(
          hole.countersink,
          "validation_hole_countersink",
          "Hole countersink must be an object"
        );
        validateScalar(hole.countersink.diameter, "Hole countersink diameter");
        validateScalar(hole.countersink.angle, "Hole countersink angle");
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
        source?: Selector;
        result?: string;
      };
      validateSelector(pattern.origin);
      ensureTuple2(pattern.spacing, "Pattern spacing");
      validateScalar(pattern.spacing?.[0], "Pattern spacing X");
      validateScalar(pattern.spacing?.[1], "Pattern spacing Y");
      ensureTuple2(pattern.count, "Pattern count");
      validateScalar(pattern.count?.[0], "Pattern count X");
      validateScalar(pattern.count?.[1], "Pattern count Y");
      if (pattern.source !== undefined) {
        validateSelector(pattern.source);
        ensureNonEmptyString(
          pattern.result,
          "validation_feature_result",
          "Pattern result is required when source is provided"
        );
      } else if (pattern.result !== undefined) {
        throw new CompileError(
          "validation_pattern_result_without_source",
          "Pattern result requires a source selector"
        );
      }
      return;
    }
    case "pattern.circular": {
      const pattern = feature as {
        origin?: Selector;
        axis?: AxisDirection;
        count?: Scalar;
        source?: Selector;
        result?: string;
      };
      validateSelector(pattern.origin);
      ensureAxis(pattern.axis, "Pattern axis is required");
      validateScalar(pattern.count, "Pattern count");
      if (pattern.source !== undefined) {
        validateSelector(pattern.source);
        ensureNonEmptyString(
          pattern.result,
          "validation_feature_result",
          "Pattern result is required when source is provided"
        );
      } else if (pattern.result !== undefined) {
        throw new CompileError(
          "validation_pattern_result_without_source",
          "Pattern result requires a source selector"
        );
      }
      return;
    }
    default:
      throw new CompileError(
        "validation_feature_kind",
        `Unknown feature kind ${String(kind)}`
      );
  }
}

function validateDatum(datum: FTIDatum): void {
  ensureObject(datum, "validation_datum", "Datum must be an object");
  ensureNonEmptyString(datum.id, "validation_datum_id", "Datum id is required");
  ensureNonEmptyString(
    datum.label,
    "validation_datum_label",
    "Datum label is required"
  );
  validateGeometryRef(datum.target, "Datum target");
  if (datum.modifiers !== undefined) {
    validateDatumModifiers(datum.modifiers, "Datum modifiers");
  }
  if (datum.capabilities !== undefined) {
    validateIdArray(datum.capabilities, "Datum capabilities");
  }
  if (datum.requirement !== undefined) {
    ensureNonEmptyString(
      datum.requirement,
      "validation_datum_requirement",
      "Datum requirement must be a string"
    );
  }
}

function validateConstraint(constraint: FTIConstraint, datumIds: Set<ID>): void {
  ensureObject(constraint, "validation_constraint", "Constraint must be an object");
  const kind = (constraint as { kind?: string }).kind;
  ensureNonEmptyString(
    kind,
    "validation_constraint_kind",
    "Constraint kind is required"
  );
  ensureNonEmptyString(
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
      validateRefSurface(entry.target, "Surface profile target");
      validatePositiveScalar(entry.tolerance, "Surface profile tolerance");
      if (entry.referenceFrame !== undefined) {
        validateRefFrame(entry.referenceFrame, "Surface profile reference frame");
      }
      if (entry.capabilities !== undefined) {
        validateIdArray(entry.capabilities, "Surface profile capabilities");
      }
      if (entry.requirement !== undefined) {
        ensureNonEmptyString(
          entry.requirement,
          "validation_constraint_requirement",
          "Surface profile requirement must be a string"
        );
      }
      return;
    }
    case "constraint.flatness": {
      const entry = constraint as FlatnessConstraint;
      validateRefSurface(entry.target, "Flatness target");
      validatePositiveScalar(entry.tolerance, "Flatness tolerance");
      if (entry.capabilities !== undefined) {
        validateIdArray(entry.capabilities, "Flatness capabilities");
      }
      if (entry.requirement !== undefined) {
        ensureNonEmptyString(
          entry.requirement,
          "validation_constraint_requirement",
          "Flatness requirement must be a string"
        );
      }
      return;
    }
    case "constraint.parallelism": {
      const entry = constraint as ParallelismConstraint;
      validateRefSurface(entry.target, "Parallelism target");
      validatePositiveScalar(entry.tolerance, "Parallelism tolerance");
      validateDatumRefs(entry.datum, datumIds, "Parallelism datum refs");
      if (entry.modifiers !== undefined) {
        validateToleranceModifiers(entry.modifiers, "Parallelism modifiers");
      }
      if (entry.capabilities !== undefined) {
        validateIdArray(entry.capabilities, "Parallelism capabilities");
      }
      if (entry.requirement !== undefined) {
        ensureNonEmptyString(
          entry.requirement,
          "validation_constraint_requirement",
          "Parallelism requirement must be a string"
        );
      }
      return;
    }
    case "constraint.perpendicularity": {
      const entry = constraint as PerpendicularityConstraint;
      validateRefSurface(entry.target, "Perpendicularity target");
      validatePositiveScalar(entry.tolerance, "Perpendicularity tolerance");
      validateDatumRefs(entry.datum, datumIds, "Perpendicularity datum refs");
      if (entry.modifiers !== undefined) {
        validateToleranceModifiers(entry.modifiers, "Perpendicularity modifiers");
      }
      if (entry.capabilities !== undefined) {
        validateIdArray(entry.capabilities, "Perpendicularity capabilities");
      }
      if (entry.requirement !== undefined) {
        ensureNonEmptyString(
          entry.requirement,
          "validation_constraint_requirement",
          "Perpendicularity requirement must be a string"
        );
      }
      return;
    }
    case "constraint.position": {
      const entry = constraint as PositionConstraint;
      validateGeometryRef(entry.target, "Position target");
      validatePositiveScalar(entry.tolerance, "Position tolerance");
      validateDatumRefs(entry.datum, datumIds, "Position datum refs");
      if (entry.modifiers !== undefined) {
        validateToleranceModifiers(entry.modifiers, "Position modifiers");
      }
      if (entry.capabilities !== undefined) {
        validateIdArray(entry.capabilities, "Position capabilities");
      }
      if (entry.requirement !== undefined) {
        ensureNonEmptyString(
          entry.requirement,
          "validation_constraint_requirement",
          "Position requirement must be a string"
        );
      }
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
      validateGeometryRef(entry.target, "Size target");
      const hasNominal = entry.nominal !== undefined || entry.tolerance !== undefined;
      const hasLimits = entry.min !== undefined || entry.max !== undefined;
      if (!hasNominal && !hasLimits) {
        throw new CompileError(
          "validation_constraint_size",
          "Size constraint must include nominal+tolerance or min+max"
        );
      }
      if (hasNominal) {
        validateScalar(entry.nominal, "Size nominal");
        validatePositiveScalar(entry.tolerance, "Size tolerance");
      }
      if (hasLimits) {
        validateScalar(entry.min, "Size min");
        validateScalar(entry.max, "Size max");
        const minVal = scalarLiteral(entry.min);
        const maxVal = scalarLiteral(entry.max);
        if (minVal !== null && maxVal !== null && minVal > maxVal) {
          throw new CompileError(
            "validation_constraint_size_limits",
            "Size min must be <= max"
          );
        }
      }
      if (entry.modifiers !== undefined) {
        validateToleranceModifiers(entry.modifiers, "Size modifiers");
      }
      if (entry.capabilities !== undefined) {
        validateIdArray(entry.capabilities, "Size capabilities");
      }
      if (entry.requirement !== undefined) {
        ensureNonEmptyString(
          entry.requirement,
          "validation_constraint_requirement",
          "Size requirement must be a string"
        );
      }
      return;
    }
    case "dimension.distance": {
      const entry = constraint as DimensionDistance;
      validateGeometryRef(entry.from, "Distance dimension from");
      validateGeometryRef(entry.to, "Distance dimension to");
      validateDimensionToleranceFields(entry, "Distance dimension");
      if (entry.capabilities !== undefined) {
        validateIdArray(entry.capabilities, "Distance dimension capabilities");
      }
      if (entry.requirement !== undefined) {
        ensureNonEmptyString(
          entry.requirement,
          "validation_constraint_requirement",
          "Distance dimension requirement must be a string"
        );
      }
      return;
    }
    case "dimension.angle": {
      const entry = constraint as DimensionAngle;
      validateGeometryRef(entry.from, "Angle dimension from");
      validateGeometryRef(entry.to, "Angle dimension to");
      validateDimensionToleranceFields(entry, "Angle dimension");
      if (entry.capabilities !== undefined) {
        validateIdArray(entry.capabilities, "Angle dimension capabilities");
      }
      if (entry.requirement !== undefined) {
        ensureNonEmptyString(
          entry.requirement,
          "validation_constraint_requirement",
          "Angle dimension requirement must be a string"
        );
      }
      return;
    }
    default:
      throw new CompileError(
        "validation_constraint_kind",
        `Unknown constraint kind ${String(kind)}`
      );
  }
}

function validateCosmeticThread(thread: CosmeticThread): void {
  ensureObject(thread, "validation_thread", "Cosmetic thread must be an object");
  ensureNonEmptyString(thread.id, "validation_thread_id", "Thread id is required");
  if (thread.kind !== "thread.cosmetic") {
    throw new CompileError(
      "validation_thread_kind",
      `Unsupported thread kind ${String((thread as { kind?: unknown }).kind)}`
    );
  }
  validateGeometryRef(thread.target, "Thread target");
  if (thread.designation !== undefined) {
    ensureNonEmptyString(
      thread.designation,
      "validation_thread_designation",
      "Thread designation must be a string"
    );
  }
  if (thread.standard !== undefined) {
    ensureNonEmptyString(
      thread.standard,
      "validation_thread_standard",
      "Thread standard must be a string"
    );
  }
  if (thread.series !== undefined) {
    ensureNonEmptyString(
      thread.series,
      "validation_thread_series",
      "Thread series must be a string"
    );
  }
  if (thread.class !== undefined) {
    ensureNonEmptyString(
      thread.class,
      "validation_thread_class",
      "Thread class must be a string"
    );
  }
  if (thread.handedness !== undefined) {
    validateThreadHandedness(thread.handedness);
  }
  if (thread.internal !== undefined && typeof thread.internal !== "boolean") {
    throw new CompileError(
      "validation_thread_internal",
      "Thread internal flag must be a boolean"
    );
  }
  if (thread.majorDiameter !== undefined) {
    validateScalar(thread.majorDiameter, "Thread major diameter");
  }
  if (thread.minorDiameter !== undefined) {
    validateScalar(thread.minorDiameter, "Thread minor diameter");
  }
  if (thread.pitch !== undefined) {
    validateScalar(thread.pitch, "Thread pitch");
  }
  if (thread.length !== undefined) {
    validateScalar(thread.length, "Thread length");
  }
  if (thread.depth !== undefined) {
    validateScalar(thread.depth, "Thread depth");
  }
  if (thread.notes !== undefined) {
    const notes = ensureArray<string>(
      thread.notes,
      "validation_thread_notes",
      "Thread notes must be an array"
    );
    for (const note of notes) {
      ensureNonEmptyString(
        note,
        "validation_thread_note",
        "Thread note must be a string"
      );
    }
  }
  if (thread.designation === undefined) {
    if (thread.majorDiameter === undefined || thread.pitch === undefined) {
      throw new CompileError(
        "validation_thread_required",
        "Thread requires designation or both majorDiameter and pitch"
      );
    }
  }
}

function validateAssertion(assertion: IntentAssertion): void {
  ensureObject(assertion, "validation_assertion", "Assertion must be an object");
  ensureNonEmptyString(
    assertion.id,
    "validation_assertion_id",
    "Assertion id is required"
  );
  switch (assertion.kind) {
    case "assert.brepValid":
      if (assertion.target) validateSelector(assertion.target);
      break;
    case "assert.minEdgeLength":
      validateScalar(assertion.min, "Assertion min edge length");
      if (assertion.target) validateSelector(assertion.target);
      break;
    default:
      throw new CompileError(
        "validation_assertion_kind",
        `Unsupported assertion kind ${(assertion as { kind?: unknown }).kind}`
      );
  }
}

function validateGeometryRef(ref: GeometryRef, label: string): void {
  ensureObject(ref, "validation_ref", `${label} must be an object`);
  switch (ref.kind) {
    case "ref.surface":
    case "ref.frame":
    case "ref.edge":
    case "ref.axis":
    case "ref.point":
      validateSelector(ref.selector);
      return;
    default:
      throw new CompileError(
        "validation_ref_kind",
        `Unknown geometry ref kind ${String((ref as { kind?: string }).kind)}`
      );
  }
}

function validateRefSurface(ref: RefSurface | undefined, label: string): void {
  if (!ref) {
    throw new CompileError("validation_ref_surface", `${label} is required`);
  }
  if (ref.kind !== "ref.surface") {
    throw new CompileError("validation_ref_surface", `${label} must be ref.surface`);
  }
  validateSelector(ref.selector);
}

function validateRefFrame(ref: RefFrame, label: string): void {
  if (!ref || ref.kind !== "ref.frame") {
    throw new CompileError("validation_ref_frame", `${label} must be ref.frame`);
  }
  validateSelector(ref.selector);
}

function validateDatumRefs(refs: DatumRef[], datumIds: Set<ID>, label: string): void {
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
  for (const ref of refs) {
    validateDatumRef(ref, datumIds);
  }
}

function validateDatumRef(ref: DatumRef, datumIds: Set<ID>): void {
  ensureObject(ref, "validation_datum_ref", "Datum ref must be an object");
  if (ref.kind !== "datum.ref") {
    throw new CompileError("validation_datum_ref", "Datum ref kind must be datum.ref");
  }
  ensureNonEmptyString(
    ref.datum,
    "validation_datum_ref_id",
    "Datum ref id is required"
  );
  if (datumIds.size > 0 && !datumIds.has(ref.datum)) {
    throw new CompileError(
      "validation_datum_ref_missing",
      `Datum ref ${ref.datum} not found`
    );
  }
  if (ref.modifiers !== undefined) {
    validateDatumModifiers(ref.modifiers, "Datum ref modifiers");
  }
}

function validateDatumModifiers(modifiers: DatumModifier[], label: string): void {
  const list = ensureArray<DatumModifier>(
    modifiers,
    "validation_datum_modifiers",
    `${label} must be an array`
  );
  for (const mod of list) {
    if (!DATUM_MODIFIERS.has(mod)) {
      throw new CompileError(
        "validation_datum_modifier",
        `Unknown datum modifier ${String(mod)}`
      );
    }
  }
}

function validateToleranceModifiers(
  modifiers: ToleranceModifier[],
  label: string
): void {
  const list = ensureArray<ToleranceModifier>(
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

function validateIdArray(values: ID[], label: string): void {
  const list = ensureArray<ID>(
    values,
    "validation_id_array",
    `${label} must be an array`
  );
  for (const value of list) {
    ensureNonEmptyString(value, "validation_id_array_item", `${label} must be strings`);
  }
}

function validatePositiveScalar(value: Scalar | undefined, label: string): void {
  validateScalar(value, label);
  const literal = scalarLiteral(value);
  if (literal !== null && literal <= 0) {
    throw new CompileError(
      "validation_scalar_positive",
      `${label} must be > 0`
    );
  }
}

function validateNonNegativeScalar(value: Scalar | undefined, label: string): void {
  validateScalar(value, label);
  const literal = scalarLiteral(value);
  if (literal !== null && literal < 0) {
    throw new CompileError(
      "validation_scalar_non_negative",
      `${label} must be >= 0`
    );
  }
}

function validateDimensionToleranceFields(
  value: {
    nominal?: Scalar;
    tolerance?: Scalar;
    plus?: Scalar;
    minus?: Scalar;
  },
  label: string
): void {
  if (value.nominal !== undefined) {
    validateScalar(value.nominal, `${label} nominal`);
  }
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
  if (value.tolerance !== undefined) {
    validatePositiveScalar(value.tolerance, `${label} tolerance`);
  }
  if (value.plus !== undefined) {
    validateNonNegativeScalar(value.plus, `${label} plus tolerance`);
  }
  if (value.minus !== undefined) {
    validateNonNegativeScalar(value.minus, `${label} minus tolerance`);
  }
}

function scalarLiteral(value: Scalar | undefined): number | null {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && value.kind === "expr.literal") {
    return typeof value.value === "number" ? value.value : null;
  }
  return null;
}

function validateSketchProfile(
  profile: SketchProfile,
  entityMap?: Map<ID, SketchEntity>
): void {
  ensureObject(profile, "validation_profile", "Sketch profile must be an object");
  ensureNonEmptyString(
    profile.name,
    "validation_profile_name",
    "Sketch profile name is required"
  );
  validateProfile(profile.profile);
  if (profile.profile.kind === "profile.sketch") {
    if (!entityMap || entityMap.size === 0) {
      throw new CompileError(
        "validation_sketch_profile_entities_missing",
        "profile.sketch requires sketch entities"
      );
    }
    const ids = new Set<ID>();
    const loop = profile.profile.loop;
    for (const id of loop) {
      if (ids.has(id)) {
        throw new CompileError(
          "validation_sketch_profile_duplicate",
          `profile.sketch loop id ${id} is duplicated`
        );
      }
      ids.add(id);
      const entity = entityMap.get(id);
      if (!entity) {
        throw new CompileError(
          "validation_sketch_profile_missing_entity",
          `profile.sketch references missing entity ${id}`
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
    for (const hole of profile.profile.holes ?? []) {
      for (const id of hole) {
        const entity = entityMap.get(id);
        if (!entity) {
          throw new CompileError(
            "validation_sketch_profile_missing_entity",
            `profile.sketch hole references missing entity ${id}`
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
  }
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
    case "profile.poly":
      validateScalar(profile.sides, "Profile polygon sides");
      validateScalar(profile.radius, "Profile polygon radius");
      if (profile.center !== undefined) {
        validatePoint3(
          profile.center,
          "validation_profile_center",
          "Profile center must be a 3D point"
        );
      }
      if (profile.rotation !== undefined) {
        validateScalar(profile.rotation, "Profile polygon rotation");
      }
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
      const loop = ensureArray<ID>(
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
        ensureNonEmptyString(
          id,
          "validation_profile_sketch_loop_id",
          "Sketch profile loop id must be a string"
        );
      }
      if (profile.holes !== undefined) {
        const holes = ensureArray<ID[]>(
          profile.holes as ID[][],
          "validation_profile_sketch_holes",
          "Sketch profile holes must be an array"
        );
        for (const hole of holes) {
          const loopIds = ensureArray<ID>(
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
            ensureNonEmptyString(
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

function validatePoint3Scalar(value: unknown, label: string): void {
  const point = ensureArray<Scalar>(
    value,
    "validation_point3",
    `${label} must be a 3D point`
  );
  if (point.length !== 3) {
    throw new CompileError(
      "validation_point3_length",
      `${label} must have 3 entries`
    );
  }
  for (const entry of point) {
    validateScalar(entry, label);
  }
}

function validateAxisSpec(value: AxisSpec | undefined, message: string): void {
  if (!value) {
    throw new CompileError("validation_axis", message);
  }
  if (typeof value === "string") {
    ensureAxis(value, message);
    return;
  }
  if (value.kind === "axis.vector") {
    validatePoint3Scalar(value.direction, message);
    return;
  }
  if (value.kind === "axis.datum") {
    ensureNonEmptyString(
      value.ref,
      "validation_axis_datum",
      "Axis datum ref is required"
    );
    return;
  }
  throw new CompileError("validation_axis", message);
}

function validateExtrudeAxis(value: ExtrudeAxis, message: string): void {
  if (typeof value === "object" && value.kind === "axis.sketch.normal") {
    return;
  }
  validateAxisSpec(value as AxisSpec, message);
}

function validateExtrudeMode(mode: unknown): void {
  if (mode === "solid" || mode === "surface") return;
  throw new CompileError(
    "validation_extrude_mode",
    "Extrude mode must be \"solid\" or \"surface\""
  );
}

function validateSweepOrientation(orientation: unknown): void {
  if (orientation === "frenet" || orientation === "fixed") return;
  throw new CompileError(
    "validation_sweep_orientation",
    "Sweep orientation must be \"frenet\" or \"fixed\""
  );
}

function validateThickenDirection(direction: unknown): void {
  if (direction === "normal" || direction === "reverse") return;
  throw new CompileError(
    "validation_thicken_direction",
    "Thicken direction must be \"normal\" or \"reverse\""
  );
}

function validateShellDirection(direction: unknown): void {
  if (direction === "inside" || direction === "outside") return;
  throw new CompileError(
    "validation_shell_direction",
    "Shell direction must be \"inside\" or \"outside\""
  );
}

function validateThreadHandedness(handedness: unknown): void {
  if (handedness === "right" || handedness === "left") return;
  throw new CompileError(
    "validation_thread_handedness",
    "Thread handedness must be \"right\" or \"left\""
  );
}

function validatePlaneRef(value: PlaneRef, label: string): void {
  if (isSelector(value)) {
    validateSelector(value);
    return;
  }
  if (value && value.kind === "plane.datum") {
    ensureNonEmptyString(
      value.ref,
      "validation_plane_datum",
      `${label} datum ref is required`
    );
    return;
  }
  throw new CompileError("validation_plane_ref", `${label} is invalid`);
}

function validatePath3D(value: Path3D | undefined, label: string): void {
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
    for (const point of points) {
      validatePoint3Scalar(point, `${label} point`);
    }
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
    for (const point of points) {
      validatePoint3Scalar(point, `${label} point`);
    }
    if (value.degree !== undefined) {
      validateScalar(value.degree, `${label} spline degree`);
    }
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
    for (const segment of segments) {
      validatePathSegment(segment, label);
    }
    return;
  }
  throw new CompileError("validation_path", `${label} has unknown kind`);
}

function validatePathSegment(segment: PathSegment, label: string): void {
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
      if (segment.direction !== undefined && segment.direction !== "cw" && segment.direction !== "ccw") {
        throw new CompileError("validation_path_direction", `${label} arc direction invalid`);
      }
      return;
  }
  throw new CompileError("validation_path_segment", `${label} segment kind invalid`);
}

function ensureAxis(value: AxisDirection | undefined, message: string): void {
  if (!value || !AXIS_DIRECTIONS.has(value)) {
    throw new CompileError("validation_axis", message);
  }
}

function isSelector(value: unknown): value is Selector {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: string }).kind;
  return (
    kind === "selector.face" ||
    kind === "selector.edge" ||
    kind === "selector.solid" ||
    kind === "selector.named"
  );
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
