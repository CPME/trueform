import {
  AxisSpec,
  ExtrudeAxis,
  IntentFeature,
  IntentPart,
  Path3D,
  PathSegment,
  Point2D,
  Point3D,
  Profile,
  ProfileRef,
  SketchEntity,
  Scalar,
  Selector,
  Units,
} from "./ir.js";
import { buildParamContext, normalizeScalar, ParamOverrides } from "./params.js";
import { normalizeSelector } from "./selectors.js";
import { shouldValidate, validatePart, type ValidationOptions } from "./ir_validate.js";
export function normalizePart(
  part: IntentPart,
  overrides?: ParamOverrides,
  options?: ValidationOptions,
  units?: Units
): IntentPart {
  if (shouldValidate(options)) validatePart(part);
  if (part.constraints && part.constraints.length > 0) {
    console.warn(
      `TrueForm: Part constraints are a data-only placeholder in v1; constraints are not evaluated (part ${part.id}).`
    );
  }
  if (part.assertions && part.assertions.length > 0) {
    console.warn(
      `TrueForm: Part assertions are data-only in v1; use evaluatePartAssertions to run them (part ${part.id}).`
    );
  }
  const ctx = buildParamContext(part.params, overrides, units ?? "mm");
  const features = part.features.map((feature) => normalizeFeature(feature, ctx));
  const connectors = part.connectors?.map((connector) => ({
    ...connector,
    origin: normalizeSelector(connector.origin),
  }));
  return { ...part, features, connectors };
}

function normalizeFeature(
  feature: IntentFeature,
  ctx: ReturnType<typeof buildParamContext>
): IntentFeature {
  const clone = { ...feature } as IntentFeature;
  if ("on" in clone && isSelector(clone.on)) {
    (clone as { on: Selector }).on = normalizeSelector(clone.on as Selector);
  }
  if ("onFace" in clone && isSelector(clone.onFace)) {
    (clone as { onFace: Selector }).onFace = normalizeSelector(
      clone.onFace as Selector
    );
  }
  if ("edges" in clone && isSelector(clone.edges)) {
    (clone as { edges: Selector }).edges = normalizeSelector(clone.edges as Selector);
  }
  if ("left" in clone && isSelector(clone.left)) {
    (clone as { left: Selector }).left = normalizeSelector(clone.left as Selector);
  }
  if ("right" in clone && isSelector(clone.right)) {
    (clone as { right: Selector }).right = normalizeSelector(clone.right as Selector);
  }
  if ("source" in clone && isSelector(clone.source)) {
    (clone as { source: Selector }).source = normalizeSelector(
      clone.source as Selector
    );
  }
  if ("surface" in clone && isSelector(clone.surface)) {
    (clone as { surface: Selector }).surface = normalizeSelector(
      clone.surface as Selector
    );
  }
  if ("origin" in clone && isSelector(clone.origin)) {
    (clone as { origin: Selector }).origin = normalizeSelector(
      clone.origin as Selector
    );
  }
  if ("plane" in clone && isSelector(clone.plane)) {
    (clone as { plane: Selector }).plane = normalizeSelector(clone.plane as Selector);
  }
  if ("frame" in clone && isSelector(clone.frame)) {
    (clone as { frame: Selector }).frame = normalizeSelector(clone.frame as Selector);
  }
  if ("openFaces" in clone && Array.isArray(clone.openFaces)) {
    (clone as { openFaces: Selector[] }).openFaces = (
      clone.openFaces as Selector[]
    ).map((face) => normalizeSelector(face));
  }

  switch (clone.kind) {
    case "datum.plane":
      clone.normal = normalizeAxisSpec(clone.normal, ctx);
      if (clone.origin !== undefined) {
        clone.origin = normalizePoint3(clone.origin, ctx);
      }
      if (clone.xAxis !== undefined) {
        clone.xAxis = normalizeAxisSpec(clone.xAxis, ctx);
      }
      break;
    case "datum.axis":
      clone.direction = normalizeAxisSpec(clone.direction, ctx);
      if (clone.origin !== undefined) {
        clone.origin = normalizePoint3(clone.origin, ctx);
      }
      break;
    case "feature.sketch2d":
      clone.profiles = clone.profiles.map((entry) => ({
        ...entry,
        profile: normalizeProfile(entry.profile, ctx),
      }));
      if (clone.entities) {
        clone.entities = clone.entities.map((entity) => normalizeSketchEntity(entity, ctx));
      }
      if (clone.origin !== undefined) {
        clone.origin = normalizePoint3(clone.origin, ctx);
      }
      break;
    case "feature.extrude":
      clone.profile = normalizeProfileRef(clone.profile, ctx);
      clone.depth = normalizeDepth(clone.depth, ctx);
      if (clone.axis !== undefined) {
        clone.axis = normalizeExtrudeAxis(clone.axis, ctx);
      }
      break;
    case "feature.surface":
      clone.profile = normalizeProfileRef(clone.profile, ctx);
      break;
    case "feature.revolve":
      clone.profile = normalizeProfileRef(clone.profile, ctx);
      clone.angle = normalizeAngle(clone.angle, ctx);
      break;
    case "feature.loft":
      clone.profiles = clone.profiles.map((profile: ProfileRef) =>
        normalizeProfileRef(profile, ctx)
      );
      break;
    case "feature.sweep":
      clone.profile = normalizeProfileRef(clone.profile, ctx);
      clone.path = normalizePath3D(clone.path, ctx);
      break;
    case "feature.shell":
      clone.thickness = normalizeScalar(clone.thickness, "length", ctx);
      break;
    case "feature.pipe":
      clone.length = normalizeScalar(clone.length, "length", ctx);
      clone.outerDiameter = normalizeScalar(clone.outerDiameter, "length", ctx);
      if (clone.innerDiameter !== undefined) {
        clone.innerDiameter = normalizeScalar(clone.innerDiameter, "length", ctx);
      }
      if (clone.origin !== undefined) {
        clone.origin = normalizePoint3(clone.origin, ctx);
      }
      break;
    case "feature.pipeSweep":
      clone.path = normalizePath3D(clone.path, ctx);
      clone.outerDiameter = normalizeScalar(clone.outerDiameter, "length", ctx);
      if (clone.innerDiameter !== undefined) {
        clone.innerDiameter = normalizeScalar(clone.innerDiameter, "length", ctx);
      }
      break;
    case "feature.hexTubeSweep":
      clone.path = normalizePath3D(clone.path, ctx);
      clone.outerAcrossFlats = normalizeScalar(clone.outerAcrossFlats, "length", ctx);
      if (clone.innerAcrossFlats !== undefined) {
        clone.innerAcrossFlats = normalizeScalar(clone.innerAcrossFlats, "length", ctx);
      }
      break;
    case "feature.thicken":
      clone.thickness = normalizeScalar(clone.thickness, "length", ctx);
      break;
    case "feature.thread":
      clone.axis = normalizeAxisSpec(clone.axis, ctx);
      if (clone.origin !== undefined) {
        clone.origin = normalizePoint3(clone.origin, ctx);
      }
      clone.length = normalizeScalar(clone.length, "length", ctx);
      clone.majorDiameter = normalizeScalar(clone.majorDiameter, "length", ctx);
      if (clone.minorDiameter !== undefined) {
        clone.minorDiameter = normalizeScalar(clone.minorDiameter, "length", ctx);
      }
      clone.pitch = normalizeScalar(clone.pitch, "length", ctx);
      if (clone.segmentsPerTurn !== undefined) {
        clone.segmentsPerTurn = normalizeScalar(clone.segmentsPerTurn, "count", ctx);
      }
      if (clone.profileAngle !== undefined) {
        clone.profileAngle = normalizeScalar(clone.profileAngle, "angle", ctx);
      }
      if (clone.crestFlat !== undefined) {
        clone.crestFlat = normalizeScalar(clone.crestFlat, "length", ctx);
      }
      if (clone.rootFlat !== undefined) {
        clone.rootFlat = normalizeScalar(clone.rootFlat, "length", ctx);
      }
      break;
    case "feature.hole":
      clone.diameter = normalizeScalar(clone.diameter, "length", ctx);
      clone.depth = normalizeDepth(clone.depth, ctx);
      if (clone.position !== undefined) {
        clone.position = normalizePoint2(clone.position, ctx);
      }
      if (clone.counterbore !== undefined) {
        clone.counterbore = {
          diameter: normalizeScalar(clone.counterbore.diameter, "length", ctx),
          depth: normalizeScalar(clone.counterbore.depth, "length", ctx),
        };
      }
      if (clone.countersink !== undefined) {
        clone.countersink = {
          diameter: normalizeScalar(clone.countersink.diameter, "length", ctx),
          angle: normalizeScalar(clone.countersink.angle, "angle", ctx),
        };
      }
      break;
    case "feature.fillet":
      clone.radius = normalizeScalar(clone.radius, "length", ctx);
      break;
    case "feature.chamfer":
      clone.distance = normalizeScalar(clone.distance, "length", ctx);
      break;
    case "pattern.linear":
      clone.spacing = [
        normalizeScalar(clone.spacing[0], "length", ctx),
        normalizeScalar(clone.spacing[1], "length", ctx),
      ];
      clone.count = [
        normalizeScalar(clone.count[0], "count", ctx),
        normalizeScalar(clone.count[1], "count", ctx),
      ];
      break;
    case "pattern.circular":
      clone.count = normalizeScalar(clone.count, "count", ctx);
      break;
    default:
      break;
  }

  return clone;
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

function normalizeProfile(profile: Profile, ctx: ReturnType<typeof buildParamContext>): Profile {
  switch (profile.kind) {
    case "profile.rectangle":
      return {
        ...profile,
        width: normalizeScalar(profile.width, "length", ctx),
        height: normalizeScalar(profile.height, "length", ctx),
        center:
          profile.center !== undefined
            ? normalizePoint3(profile.center, ctx)
            : profile.center,
      };
    case "profile.circle":
      return {
        ...profile,
        radius: normalizeScalar(profile.radius, "length", ctx),
        center:
          profile.center !== undefined
            ? normalizePoint3(profile.center, ctx)
            : profile.center,
      };
    case "profile.poly":
      return {
        ...profile,
        sides: normalizeScalar(profile.sides, "count", ctx),
        radius: normalizeScalar(profile.radius, "length", ctx),
        center:
          profile.center !== undefined
            ? normalizePoint3(profile.center, ctx)
            : profile.center,
        rotation:
          profile.rotation !== undefined
            ? normalizeScalar(profile.rotation, "angle", ctx)
            : profile.rotation,
      };
    case "profile.sketch":
      return {
        ...profile,
      };
  }
}

function normalizePoint2(
  point: Point2D,
  ctx: ReturnType<typeof buildParamContext>
): [number, number] {
  return [
    normalizeScalar(point[0], "length", ctx),
    normalizeScalar(point[1], "length", ctx),
  ];
}

function normalizePoint3(
  point: Point3D,
  ctx: ReturnType<typeof buildParamContext>
): [number, number, number] {
  return [
    normalizeScalar(point[0], "length", ctx),
    normalizeScalar(point[1], "length", ctx),
    normalizeScalar(point[2], "length", ctx),
  ];
}

function normalizeAxisSpec(
  axis: AxisSpec,
  ctx: ReturnType<typeof buildParamContext>
): AxisSpec {
  if (typeof axis === "string") return axis;
  if (axis.kind === "axis.vector") {
    return { ...axis, direction: normalizePoint3(axis.direction, ctx) };
  }
  return axis;
}

function normalizeExtrudeAxis(
  axis: ExtrudeAxis,
  ctx: ReturnType<typeof buildParamContext>
): ExtrudeAxis {
  if (typeof axis === "object" && axis.kind === "axis.sketch.normal") return axis;
  return normalizeAxisSpec(axis as AxisSpec, ctx);
}

function normalizePath3D(
  path: Path3D,
  ctx: ReturnType<typeof buildParamContext>
): Path3D {
  if (path.kind === "path.polyline") {
    return {
      ...path,
      points: path.points.map((point) => normalizePoint3(point, ctx)),
    };
  }
  if (path.kind === "path.spline") {
    return {
      ...path,
      points: path.points.map((point) => normalizePoint3(point, ctx)),
      degree:
        path.degree === undefined
          ? undefined
          : normalizeScalar(path.degree, "count", ctx),
    };
  }
  return {
    ...path,
    segments: path.segments.map((segment) => normalizePathSegment(segment, ctx)),
  };
}

function normalizePathSegment(
  segment: PathSegment,
  ctx: ReturnType<typeof buildParamContext>
): PathSegment {
  switch (segment.kind) {
    case "path.line":
      return {
        ...segment,
        start: normalizePoint3(segment.start, ctx),
        end: normalizePoint3(segment.end, ctx),
      };
    case "path.arc":
      return {
        ...segment,
        start: normalizePoint3(segment.start, ctx),
        end: normalizePoint3(segment.end, ctx),
        center: normalizePoint3(segment.center, ctx),
      };
  }
  return segment;
}

function normalizeSketchEntity(
  entity: SketchEntity,
  ctx: ReturnType<typeof buildParamContext>
): SketchEntity {
  switch (entity.kind) {
    case "sketch.line":
      return {
        ...entity,
        start: normalizePoint2(entity.start, ctx),
        end: normalizePoint2(entity.end, ctx),
      };
    case "sketch.arc":
      return {
        ...entity,
        start: normalizePoint2(entity.start, ctx),
        end: normalizePoint2(entity.end, ctx),
        center: normalizePoint2(entity.center, ctx),
      };
    case "sketch.circle":
      return {
        ...entity,
        center: normalizePoint2(entity.center, ctx),
        radius: normalizeScalar(entity.radius, "length", ctx),
      };
    case "sketch.ellipse":
      return {
        ...entity,
        center: normalizePoint2(entity.center, ctx),
        radiusX: normalizeScalar(entity.radiusX, "length", ctx),
        radiusY: normalizeScalar(entity.radiusY, "length", ctx),
        rotation:
          entity.rotation === undefined
            ? undefined
            : normalizeScalar(entity.rotation, "angle", ctx),
      };
    case "sketch.rectangle":
      if (entity.mode === "center") {
        return {
          ...entity,
          center: normalizePoint2(entity.center, ctx),
          width: normalizeScalar(entity.width, "length", ctx),
          height: normalizeScalar(entity.height, "length", ctx),
          rotation:
            entity.rotation === undefined
              ? undefined
              : normalizeScalar(entity.rotation, "angle", ctx),
        };
      }
      return {
        ...entity,
        corner: normalizePoint2(entity.corner, ctx),
        width: normalizeScalar(entity.width, "length", ctx),
        height: normalizeScalar(entity.height, "length", ctx),
        rotation:
          entity.rotation === undefined
            ? undefined
            : normalizeScalar(entity.rotation, "angle", ctx),
      };
    case "sketch.slot":
      return {
        ...entity,
        center: normalizePoint2(entity.center, ctx),
        length: normalizeScalar(entity.length, "length", ctx),
        width: normalizeScalar(entity.width, "length", ctx),
        rotation:
          entity.rotation === undefined
            ? undefined
            : normalizeScalar(entity.rotation, "angle", ctx),
      };
    case "sketch.polygon":
      return {
        ...entity,
        center: normalizePoint2(entity.center, ctx),
        radius: normalizeScalar(entity.radius, "length", ctx),
        sides: normalizeScalar(entity.sides, "count", ctx),
        rotation:
          entity.rotation === undefined
            ? undefined
            : normalizeScalar(entity.rotation, "angle", ctx),
      };
    case "sketch.spline":
      return {
        ...entity,
        points: entity.points.map((point) => normalizePoint2(point, ctx)),
        degree:
          entity.degree === undefined
            ? undefined
            : normalizeScalar(entity.degree, "count", ctx),
      };
    case "sketch.point":
      return {
        ...entity,
        point: normalizePoint2(entity.point, ctx),
      };
  }
}

function normalizeProfileRef(
  profile: ProfileRef,
  ctx: ReturnType<typeof buildParamContext>
): ProfileRef {
  if (profile.kind === "profile.ref") return profile;
  return normalizeProfile(profile, ctx);
}

function normalizeDepth(
  depth: Scalar | "throughAll",
  ctx: ReturnType<typeof buildParamContext>
): number | "throughAll" {
  if (depth === "throughAll") return depth;
  return normalizeScalar(depth, "length", ctx);
}

function normalizeAngle(
  angle: Scalar | "full" | undefined,
  ctx: ReturnType<typeof buildParamContext>
): number | "full" | undefined {
  if (angle === undefined || angle === "full") return angle;
  return normalizeScalar(angle, "angle", ctx);
}
