import {
  AxisDirection,
  AxisSpec,
  BuildContext,
  CosmeticThread,
  ExtrudeAxis,
  Expr,
  FTIConstraint,
  FTIDatum,
  HoleEndCondition,
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
  PatternRef,
  Path3D,
  PathSegment,
  Point2D,
  Point3D,
  PlaneRef,
  Predicate,
  Profile,
  ProfileRef,
  RankRule,
  Scalar,
  Selector,
  SketchConstraint,
  SketchEntity,
  SketchProfile,
  Transform,
  Unit,
  TF_IR_SCHEMA,
  TF_IR_VERSION,
} from "./ir.js";
import { CompileError } from "./errors.js";
import {
  ensureArray,
  ensureAxis,
  ensureFiniteNumber,
  ensureNonEmptyString,
  ensureObject,
  ensureTuple2,
  isParamType,
  isSelector,
  validateAxisSpec,
  validateExpr,
  validateExtendSurfaceMode,
  validateExtrudeAxis,
  validateExtrudeMode,
  validateHoleEndCondition,
  validatePath3D,
  validatePlaneRef,
  validatePoint2,
  validatePoint3,
  validatePoint3Scalar,
  validatePredicate,
  validateRankRule,
  validateRibThicknessSide,
  validateScalar,
  validateSelector,
  validateShellDirection,
  validateSweepOrientation,
  validateThickenDirection,
  validateThreadHandedness,
  validateTrimSurfaceKeep,
  validateUnwrapMode,
} from "./validation/ir_validation_core.js";
import {
  validateAssembly as validateAssemblyShape,
  validateConnector as validateConnectorShape,
  validateContext as validateBuildContextShape,
  validateParam as validateParamShape,
} from "./validation/ir_validation_structure.js";
import {
  validateConstraint as validateFtiConstraint,
  validateCosmeticThread as validateFtiCosmeticThread,
  validateDatum as validateFtiDatum,
  type FtiValidationDeps,
} from "./validation/ir_validation_fti.js";
import {
  validateDepth as validateFeatureDepth,
  validatePatternRef as validateSketchPatternRef,
  validateProfileRef as validateSketchProfileRef,
  validateSketchConstraint as validateSketchConstraintShape,
  validateSketchEntity as validateSketchEntityShape,
  validateSketchProfile as validateSketchProfileShape,
  type SketchValidationDeps,
} from "./validation/ir_validation_sketch.js";

export type ValidationMode = "strict" | "none";
export type StagedFeaturePolicy = "allow" | "warn" | "error";
export type ValidationOptions = {
  validate?: ValidationMode;
  stagedFeatures?: StagedFeaturePolicy;
};

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
  validateBuildContextShape(ctx);
}

function sketchValidationDeps(): SketchValidationDeps {
  return {
    ensureArray,
    ensureNonEmptyString,
    ensureObject,
    validateNonNegativeScalar,
    validatePoint2,
    validatePoint3,
    validateScalar,
    validatePositiveScalar,
    scalarLiteral,
  };
}

function ftiValidationDeps(): FtiValidationDeps {
  return {
    ensureArray,
    ensureNonEmptyString,
    ensureObject,
    validateScalar,
    validateSelector,
    validateThreadHandedness,
    scalarLiteral,
  };
}

function validateAssembly(
  assembly: IntentAssembly,
  partIds: Set<ID>,
  connectorIdsByPart: Map<ID, Set<ID>>
): void {
  validateAssemblyShape(assembly, partIds, connectorIdsByPart);
}

function validateConnector(connector: MateConnector): void {
  validateConnectorShape(connector);
}

function validateParam(param: ParamDef): void {
  validateParamShape(param);
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
      const sketch = feature as {
        profiles?: SketchProfile[];
        plane?: PlaneRef;
        entities?: SketchEntity[];
        constraints?: SketchConstraint[];
      };
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
      if (sketch.constraints !== undefined) {
        const constraints = ensureArray<SketchConstraint>(
          sketch.constraints,
          "validation_sketch_constraints",
          "Sketch constraints must be an array"
        );
        for (const constraint of constraints) {
          validateSketchConstraint(constraint);
        }
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
    case "feature.rib":
    case "feature.web": {
      const rib = feature as {
        profile?: ProfileRef;
        thickness?: Scalar;
        depth?: Scalar;
        result?: string;
        axis?: ExtrudeAxis;
        side?: unknown;
      };
      validateProfileRef(rib.profile);
      if (rib.profile?.kind !== "profile.ref") {
        throw new CompileError(
          "validation_profile_sketch_ref",
          `${kind} requires profileRef(...) to an open sketch profile`
        );
      }
      validateScalar(rib.thickness, `${kind} thickness`);
      validateScalar(rib.depth, `${kind} depth`);
      if (rib.axis !== undefined) {
        validateExtrudeAxis(rib.axis, `${kind} axis`);
      }
      if (rib.side !== undefined) {
        validateRibThicknessSide(rib.side);
      }
      ensureNonEmptyString(
        rib.result,
        "validation_feature_result",
        `${kind} result is required`
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
    case "feature.delete.face": {
      const remove = feature as {
        source?: Selector;
        faces?: Selector;
        heal?: unknown;
        result?: string;
      };
      validateSelector(remove.source);
      validateSelector(remove.faces);
      if (remove.heal !== undefined && typeof remove.heal !== "boolean") {
        throw new CompileError(
          "validation_delete_face_heal",
          "Delete face heal must be a boolean"
        );
      }
      ensureNonEmptyString(
        remove.result,
        "validation_feature_result",
        "Delete face result is required"
      );
      return;
    }
    case "feature.replace.face": {
      const replace = feature as {
        source?: Selector;
        faces?: Selector;
        tool?: Selector;
        heal?: unknown;
        result?: string;
      };
      validateSelector(replace.source);
      validateSelector(replace.faces);
      validateSelector(replace.tool);
      if (replace.heal !== undefined && typeof replace.heal !== "boolean") {
        throw new CompileError(
          "validation_replace_face_heal",
          "Replace face heal must be a boolean"
        );
      }
      ensureNonEmptyString(
        replace.result,
        "validation_feature_result",
        "Replace face result is required"
      );
      return;
    }
    case "feature.move.face": {
      const move = feature as {
        source?: Selector;
        faces?: Selector;
        translation?: Point3D;
        rotationAxis?: AxisSpec;
        rotationAngle?: Scalar;
        scale?: Scalar;
        origin?: Point3D;
        heal?: unknown;
        result?: string;
      };
      validateSelector(move.source);
      validateSelector(move.faces);
      if (move.translation !== undefined) {
        validatePoint3Scalar(move.translation, "Move face translation");
      }
      if (move.rotationAxis !== undefined || move.rotationAngle !== undefined) {
        validateAxisSpec(move.rotationAxis, "Move face rotation axis is required");
        validateScalar(move.rotationAngle, "Move face rotation angle");
      }
      if (move.scale !== undefined) {
        validatePositiveScalar(move.scale, "Move face scale");
      }
      if (move.origin !== undefined) {
        validatePoint3Scalar(move.origin, "Move face origin");
      }
      if (move.heal !== undefined && typeof move.heal !== "boolean") {
        throw new CompileError(
          "validation_move_face_heal",
          "Move face heal must be a boolean"
        );
      }
      if (
        move.translation === undefined &&
        move.rotationAngle === undefined &&
        move.scale === undefined
      ) {
        throw new CompileError(
          "validation_move_face_transform",
          "Move face requires translation, rotation, or scale"
        );
      }
      ensureNonEmptyString(
        move.result,
        "validation_feature_result",
        "Move face result is required"
      );
      return;
    }
    case "feature.move.body": {
      const move = feature as {
        source?: Selector;
        translation?: Point3D;
        rotationAxis?: AxisSpec;
        rotationAngle?: Scalar;
        scale?: Scalar;
        origin?: Point3D;
        result?: string;
      };
      validateSelector(move.source);
      if (move.translation !== undefined) {
        validatePoint3Scalar(move.translation, "Move body translation");
      }
      if (move.rotationAxis !== undefined || move.rotationAngle !== undefined) {
        validateAxisSpec(move.rotationAxis, "Move body rotation axis is required");
        validateScalar(move.rotationAngle, "Move body rotation angle");
      }
      if (move.scale !== undefined) {
        validatePositiveScalar(move.scale, "Move body scale");
      }
      if (move.origin !== undefined) {
        validatePoint3Scalar(move.origin, "Move body origin");
      }
      if (
        move.translation === undefined &&
        move.rotationAngle === undefined &&
        move.scale === undefined
      ) {
        throw new CompileError(
          "validation_move_body_transform",
          "Move body requires translation, rotation, or scale"
        );
      }
      ensureNonEmptyString(
        move.result,
        "validation_feature_result",
        "Move body result is required"
      );
      return;
    }
    case "feature.split.body": {
      const split = feature as {
        source?: Selector;
        tool?: Selector;
        keepTool?: unknown;
        result?: string;
      };
      validateSelector(split.source);
      validateSelector(split.tool);
      if (split.keepTool !== undefined && typeof split.keepTool !== "boolean") {
        throw new CompileError(
          "validation_split_keep_tool",
          "Split body keepTool must be a boolean"
        );
      }
      ensureNonEmptyString(
        split.result,
        "validation_feature_result",
        "Split body result is required"
      );
      return;
    }
    case "feature.split.face": {
      const split = feature as {
        faces?: Selector;
        tool?: Selector;
        result?: string;
      };
      validateSelector(split.faces);
      validateSelector(split.tool);
      ensureNonEmptyString(
        split.result,
        "validation_feature_result",
        "Split face result is required"
      );
      return;
    }
    case "feature.trim.surface": {
      const trim = feature as {
        source?: Selector;
        tools?: Selector[];
        keep?: unknown;
        result?: string;
      };
      validateSelector(trim.source);
      const tools = ensureArray<Selector>(
        trim.tools as Selector[],
        "validation_trim_surface_tools",
        "Trim surface tools must be an array"
      );
      if (tools.length === 0) {
        throw new CompileError(
          "validation_trim_surface_tools",
          "Trim surface requires at least one tool selector"
        );
      }
      for (const tool of tools) {
        validateSelector(tool);
      }
      validateTrimSurfaceKeep(trim.keep);
      ensureNonEmptyString(
        trim.result,
        "validation_feature_result",
        "Trim surface result is required"
      );
      return;
    }
    case "feature.extend.surface": {
      const extend = feature as {
        source?: Selector;
        edges?: Selector;
        distance?: Scalar;
        mode?: unknown;
        result?: string;
      };
      validateSelector(extend.source);
      validateSelector(extend.edges);
      validatePositiveScalar(extend.distance, "Extend surface distance");
      if (extend.mode !== undefined) {
        validateExtendSurfaceMode(extend.mode);
      }
      ensureNonEmptyString(
        extend.result,
        "validation_feature_result",
        "Extend surface result is required"
      );
      return;
    }
    case "feature.knit": {
      const knit = feature as {
        sources?: Selector[];
        tolerance?: Scalar;
        makeSolid?: unknown;
        result?: string;
      };
      const sources = ensureArray<Selector>(
        knit.sources as Selector[],
        "validation_knit_sources",
        "Knit sources must be an array"
      );
      if (sources.length === 0) {
        throw new CompileError(
          "validation_knit_sources",
          "Knit requires at least one source selector"
        );
      }
      for (const source of sources) {
        validateSelector(source);
      }
      if (knit.tolerance !== undefined) {
        validatePositiveScalar(knit.tolerance, "Knit tolerance");
      }
      if (knit.makeSolid !== undefined && typeof knit.makeSolid !== "boolean") {
        throw new CompileError(
          "validation_knit_make_solid",
          "Knit makeSolid must be a boolean"
        );
      }
      ensureNonEmptyString(
        knit.result,
        "validation_feature_result",
        "Knit result is required"
      );
      return;
    }
    case "feature.curve.intersect": {
      const curve = feature as {
        first?: Selector;
        second?: Selector;
        result?: string;
      };
      validateSelector(curve.first);
      validateSelector(curve.second);
      ensureNonEmptyString(
        curve.result,
        "validation_feature_result",
        "Curve intersect result is required"
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
    case "feature.unwrap": {
      const unwrap = feature as {
        source?: Selector;
        mode?: unknown;
        result?: string;
      };
      validateSelector(unwrap.source);
      if (unwrap.mode !== undefined) {
        validateUnwrapMode(unwrap.mode);
      }
      ensureNonEmptyString(
        unwrap.result,
        "validation_feature_result",
        "Unwrap result is required"
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
        result?: string;
        wizard?: {
          standard?: string;
          series?: string;
          size?: string;
          fitClass?: string;
          threadClass?: string;
          threaded?: boolean;
          endCondition?: HoleEndCondition;
        };
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
      if (hole.wizard !== undefined) {
        ensureObject(
          hole.wizard,
          "validation_hole_wizard",
          "Hole wizard must be an object"
        );
        if (hole.wizard.standard !== undefined) {
          ensureNonEmptyString(
            hole.wizard.standard,
            "validation_hole_wizard_standard",
            "Hole wizard standard must be a string"
          );
        }
        if (hole.wizard.series !== undefined) {
          ensureNonEmptyString(
            hole.wizard.series,
            "validation_hole_wizard_series",
            "Hole wizard series must be a string"
          );
        }
        if (hole.wizard.size !== undefined) {
          ensureNonEmptyString(
            hole.wizard.size,
            "validation_hole_wizard_size",
            "Hole wizard size must be a string"
          );
        }
        if (hole.wizard.fitClass !== undefined) {
          ensureNonEmptyString(
            hole.wizard.fitClass,
            "validation_hole_wizard_fit_class",
            "Hole wizard fit class must be a string"
          );
        }
        if (hole.wizard.threadClass !== undefined) {
          ensureNonEmptyString(
            hole.wizard.threadClass,
            "validation_hole_wizard_thread_class",
            "Hole wizard thread class must be a string"
          );
        }
        if (hole.wizard.threaded !== undefined && typeof hole.wizard.threaded !== "boolean") {
          throw new CompileError(
            "validation_hole_wizard_threaded",
            "Hole wizard threaded must be a boolean"
          );
        }
        if (hole.wizard.endCondition !== undefined) {
          validateHoleEndCondition(hole.wizard.endCondition);
          if (hole.wizard.endCondition === "throughAll" && hole.depth !== "throughAll") {
            throw new CompileError(
              "validation_hole_wizard_end_condition",
              "Hole wizard throughAll end condition requires depth 'throughAll'"
            );
          }
          if (hole.wizard.endCondition === "blind" && hole.depth === "throughAll") {
            throw new CompileError(
              "validation_hole_wizard_end_condition",
              "Hole wizard blind end condition requires numeric depth"
            );
          }
          if (
            (hole.wizard.endCondition === "upToNext" ||
              hole.wizard.endCondition === "upToLast") &&
            hole.depth === "throughAll"
          ) {
            throw new CompileError(
              "validation_hole_wizard_end_condition",
              "Hole wizard upToNext/upToLast end conditions require numeric depth"
            );
          }
        }
      }
      if (hole.result !== undefined) {
        ensureNonEmptyString(
          hole.result,
          "validation_feature_result",
          "Hole result must be a non-empty string"
        );
      }
      return;
    }
    case "feature.fillet": {
      const fillet = feature as { edges?: Selector; radius?: Scalar; result?: string };
      validateSelector(fillet.edges);
      validateScalar(fillet.radius, "Fillet radius");
      if (fillet.result !== undefined) {
        ensureNonEmptyString(
          fillet.result,
          "validation_feature_result",
          "Fillet result must be a non-empty string"
        );
      }
      return;
    }
    case "feature.fillet.variable": {
      const fillet = feature as {
        source?: Selector;
        entries?: Array<{ edge?: Selector; radius?: Scalar }>;
        result?: string;
      };
      validateSelector(fillet.source);
      const entries = ensureArray<{ edge?: Selector; radius?: Scalar }>(
        fillet.entries,
        "validation_variable_fillet_entries",
        "Variable fillet entries must be an array"
      );
      if (entries.length === 0) {
        throw new CompileError(
          "validation_variable_fillet_entries",
          "Variable fillet requires at least one entry"
        );
      }
      for (const entry of entries) {
        validateSelector(entry.edge);
        validateScalar(entry.radius, "Variable fillet radius");
      }
      ensureNonEmptyString(
        fillet.result,
        "validation_feature_result",
        "Variable fillet result is required"
      );
      return;
    }
    case "feature.chamfer": {
      const chamfer = feature as { edges?: Selector; distance?: Scalar; result?: string };
      validateSelector(chamfer.edges);
      validateScalar(chamfer.distance, "Chamfer distance");
      if (chamfer.result !== undefined) {
        ensureNonEmptyString(
          chamfer.result,
          "validation_feature_result",
          "Chamfer result must be a non-empty string"
        );
      }
      return;
    }
    case "feature.chamfer.variable": {
      const chamfer = feature as {
        source?: Selector;
        entries?: Array<{ edge?: Selector; distance?: Scalar }>;
        result?: string;
      };
      validateSelector(chamfer.source);
      const entries = ensureArray<{ edge?: Selector; distance?: Scalar }>(
        chamfer.entries,
        "validation_variable_chamfer_entries",
        "Variable chamfer entries must be an array"
      );
      if (entries.length === 0) {
        throw new CompileError(
          "validation_variable_chamfer_entries",
          "Variable chamfer requires at least one entry"
        );
      }
      for (const entry of entries) {
        validateSelector(entry.edge);
        validateScalar(entry.distance, "Variable chamfer distance");
      }
      ensureNonEmptyString(
        chamfer.result,
        "validation_feature_result",
        "Variable chamfer result is required"
      );
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
  validateFtiDatum(ftiValidationDeps(), datum);
}

function validateConstraint(constraint: FTIConstraint, datumIds: Set<ID>): void {
  validateFtiConstraint(ftiValidationDeps(), constraint, datumIds);
}

function validateCosmeticThread(thread: CosmeticThread): void {
  validateFtiCosmeticThread(ftiValidationDeps(), thread);
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
  validateSketchProfileShape(sketchValidationDeps(), profile, entityMap);
}

function validateSketchEntity(entity: SketchEntity): void {
  validateSketchEntityShape(sketchValidationDeps(), entity);
}

function validateSketchConstraint(constraint: SketchConstraint): void {
  validateSketchConstraintShape(sketchValidationDeps(), constraint);
}

function validateProfileRef(profile: ProfileRef | undefined): void {
  validateSketchProfileRef(sketchValidationDeps(), profile);
}

function validatePatternRef(pattern: PatternRef): void {
  validateSketchPatternRef(sketchValidationDeps(), pattern);
}

function validateDepth(depth: Scalar | "throughAll" | undefined): void {
  validateFeatureDepth(sketchValidationDeps(), depth);
}
