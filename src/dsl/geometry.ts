import type {
  AxisDirection,
  AxisSpec,
  BooleanOp,
  Chamfer,
  DatumAxis,
  DatumFrame,
  DatumPlane,
  EdgeQuery,
  Extrude,
  ExtrudeAxis,
  FaceQuery,
  Fillet,
  VariableFillet,
  VariableFilletEntry,
  Hole,
  ID,
  Loft,
  NamedOutput,
  Path3D,
  PathSegment,
  PatternCircular,
  PatternLinear,
  Plane,
  PatternRef,
  Pipe,
  PipeSweep,
  HexTubeSweep,
  PlaneRef,
  Point2D,
  Point3D,
  Predicate,
  Profile,
  ProfileRef,
  MoveBody,
  MoveFace,
  DeleteFace,
  ReplaceFace,
  Mirror,
  SplitBody,
  SplitFace,
  Draft,
  RankRule,
  Revolve,
  Scalar,
  Selector,
  Sketch2D,
  SketchArc,
  SketchCircle,
  SketchEllipse,
  SketchEntity,
  SketchPoint,
  SketchPolygon,
  SketchProfile,
  SketchProfileBundle,
  SketchRectangle,
  SketchSlot,
  SketchSpline,
  SketchLine,
  SolidQuery,
  Surface,
  Shell,
  Sweep,
  Thicken,
  ThickenDirection,
  Thread,
  VariableChamfer,
  VariableChamferEntry,
  ThreadHandedness,
} from "../ir.js";
import { compact } from "./utils.js";

export const datumPlane = (
  id: ID,
  normal: DatumPlane["normal"],
  origin?: DatumPlane["origin"],
  deps?: ID[],
  opts?: { xAxis?: DatumPlane["xAxis"] }
): DatumPlane =>
  compact({
    id,
    kind: "datum.plane",
    normal,
    origin,
    xAxis: opts?.xAxis,
    deps,
  });

export const datumAxis = (
  id: ID,
  direction: DatumAxis["direction"],
  origin?: DatumAxis["origin"],
  deps?: ID[]
): DatumAxis =>
  compact({
    id,
    kind: "datum.axis",
    direction,
    origin,
    deps,
  });

export const datumFrame = (id: ID, on: Selector, deps?: ID[]): DatumFrame =>
  compact({ id, kind: "datum.frame", on, deps });

export const sketch2d = (
  id: ID,
  profiles: SketchProfile[],
  opts?: {
    plane?: PlaneRef;
    origin?: [number, number, number];
    deps?: ID[];
    entities?: SketchEntity[];
  }
): Sketch2D =>
  compact({
    id,
    kind: "feature.sketch2d",
    profiles,
    plane: opts?.plane,
    origin: opts?.origin,
    deps: opts?.deps,
    entities: opts?.entities,
  });

export const sketchLine = (
  id: ID,
  start: Point2D,
  end: Point2D,
  opts?: { construction?: boolean }
): SketchLine =>
  compact({
    id,
    kind: "sketch.line",
    start,
    end,
    construction: opts?.construction,
  });

export const sketchArc = (
  id: ID,
  start: Point2D,
  end: Point2D,
  center: Point2D,
  direction: SketchArc["direction"],
  opts?: { construction?: boolean }
): SketchArc =>
  compact({
    id,
    kind: "sketch.arc",
    start,
    end,
    center,
    direction,
    construction: opts?.construction,
  });

export const sketchCircle = (
  id: ID,
  center: Point2D,
  radius: Scalar,
  opts?: { construction?: boolean }
): SketchCircle =>
  compact({
    id,
    kind: "sketch.circle",
    center,
    radius,
    construction: opts?.construction,
  });

export const sketchEllipse = (
  id: ID,
  center: Point2D,
  radiusX: Scalar,
  radiusY: Scalar,
  opts?: { rotation?: Scalar; construction?: boolean }
): SketchEllipse =>
  compact({
    id,
    kind: "sketch.ellipse",
    center,
    radiusX,
    radiusY,
    rotation: opts?.rotation,
    construction: opts?.construction,
  });

export const sketchRectCenter = (
  id: ID,
  center: Point2D,
  width: Scalar,
  height: Scalar,
  opts?: { rotation?: Scalar; construction?: boolean }
): SketchRectangle =>
  compact({
    id,
    kind: "sketch.rectangle",
    mode: "center",
    center,
    width,
    height,
    rotation: opts?.rotation,
    construction: opts?.construction,
  });

export const sketchRectCorner = (
  id: ID,
  corner: Point2D,
  width: Scalar,
  height: Scalar,
  opts?: { rotation?: Scalar; construction?: boolean }
): SketchRectangle =>
  compact({
    id,
    kind: "sketch.rectangle",
    mode: "corner",
    corner,
    width,
    height,
    rotation: opts?.rotation,
    construction: opts?.construction,
  });

export const sketchSlot = (
  id: ID,
  center: Point2D,
  length: Scalar,
  width: Scalar,
  opts?: {
    rotation?: Scalar;
    endStyle?: SketchSlot["endStyle"];
    construction?: boolean;
  }
): SketchSlot =>
  compact({
    id,
    kind: "sketch.slot",
    center,
    length,
    width,
    rotation: opts?.rotation,
    endStyle: opts?.endStyle,
    construction: opts?.construction,
  });

export const sketchPolygon = (
  id: ID,
  center: Point2D,
  radius: Scalar,
  sides: Scalar,
  opts?: { rotation?: Scalar; construction?: boolean }
): SketchPolygon =>
  compact({
    id,
    kind: "sketch.polygon",
    center,
    radius,
    sides,
    rotation: opts?.rotation,
    construction: opts?.construction,
  });

export const sketchSpline = (
  id: ID,
  points: Point2D[],
  opts?: { closed?: boolean; degree?: Scalar; construction?: boolean }
): SketchSpline =>
  compact({
    id,
    kind: "sketch.spline",
    points,
    closed: opts?.closed,
    degree: opts?.degree,
    construction: opts?.construction,
  });

export const sketchPoint = (
  id: ID,
  point: Point2D,
  opts?: { construction?: boolean }
): SketchPoint =>
  compact({
    id,
    kind: "sketch.point",
    point,
    construction: opts?.construction,
  });

export const extrude = (
  id: ID,
  profile: ProfileRef,
  depth: Extrude["depth"],
  result?: string,
  deps?: ID[],
  opts?: { axis?: ExtrudeAxis; mode?: Extrude["mode"] }
): Extrude =>
  compact({
    id,
    kind: "feature.extrude",
    profile,
    depth,
    result: result ?? (opts?.mode === "surface" ? `surface:${id}` : `body:${id}`),
    deps,
    axis: opts?.axis,
    mode: opts?.mode,
  });

export const plane = (
  id: ID,
  width: Plane["width"],
  height: Plane["height"],
  result?: string,
  opts?: { plane?: Plane["plane"]; origin?: Plane["origin"]; deps?: ID[] }
): Plane =>
  compact({
    id,
    kind: "feature.plane",
    width,
    height,
    plane: opts?.plane,
    origin: opts?.origin,
    result: result ?? `surface:${id}`,
    deps: opts?.deps,
  });

export const surface = (
  id: ID,
  profile: ProfileRef,
  result?: string,
  deps?: ID[]
): Surface =>
  compact({
    id,
    kind: "feature.surface",
    profile,
    result: result ?? `surface:${id}`,
    deps,
  });

export const revolve = (
  id: ID,
  profile: ProfileRef,
  axis: Revolve["axis"],
  angle: Revolve["angle"],
  result?: string,
  opts?: { origin?: [number, number, number]; deps?: ID[]; mode?: Revolve["mode"] }
): Revolve =>
  compact({
    id,
    kind: "feature.revolve",
    profile,
    axis,
    angle,
    origin: opts?.origin,
    result: result ?? (opts?.mode === "surface" ? `surface:${id}` : `body:${id}`),
    deps: opts?.deps,
    mode: opts?.mode,
  });

export const loft = (
  id: ID,
  profiles: ProfileRef[],
  result?: string,
  deps?: ID[],
  opts?: { mode?: Loft["mode"] }
): Loft =>
  compact({
    id,
    kind: "feature.loft",
    profiles,
    result: result ?? (opts?.mode === "surface" ? `surface:${id}` : `body:${id}`),
    deps,
    mode: opts?.mode,
  });

export const sweep = (
  id: ID,
  profile: ProfileRef,
  path: Path3D,
  result?: string,
  deps?: ID[],
  opts?: {
    mode?: Sweep["mode"];
    frame?: Sweep["frame"];
    orientation?: Sweep["orientation"];
  }
): Sweep =>
  compact({
    id,
    kind: "feature.sweep",
    profile,
    path,
    result: result ?? (opts?.mode === "surface" ? `surface:${id}` : `body:${id}`),
    deps,
    mode: opts?.mode,
    frame: opts?.frame,
    orientation: opts?.orientation,
  });

export const pipe = (
  id: ID,
  axis: AxisDirection,
  length: Scalar,
  outerDiameter: Scalar,
  innerDiameter?: Scalar,
  result?: string,
  opts?: { origin?: Point3D; deps?: ID[] }
): Pipe =>
  compact({
    id,
    kind: "feature.pipe",
    axis,
    length,
    outerDiameter,
    innerDiameter,
    origin: opts?.origin,
    result: result ?? `body:${id}`,
    deps: opts?.deps,
  });

/**
 * Compatibility helper. Prefer `sweep(..., profileCircle(...), path, ...)`
 * for new code to keep sweep workflows unified.
 */
export const pipeSweep = (
  id: ID,
  path: Path3D,
  outerDiameter: Scalar,
  innerDiameter?: Scalar,
  result?: string,
  opts?: { deps?: ID[]; mode?: PipeSweep["mode"] }
): PipeSweep =>
  compact({
    id,
    kind: "feature.pipeSweep",
    path,
    outerDiameter,
    innerDiameter,
    result: result ?? (opts?.mode === "surface" ? `surface:${id}` : `body:${id}`),
    deps: opts?.deps,
    mode: opts?.mode,
  });

/**
 * Compatibility helper. Prefer `sweep(..., profilePoly(6, ...), path, ...)`
 * for new code to keep sweep workflows unified.
 */
export const hexTubeSweep = (
  id: ID,
  path: Path3D,
  outerAcrossFlats: Scalar,
  innerAcrossFlats?: Scalar,
  result?: string,
  opts?: { deps?: ID[]; mode?: HexTubeSweep["mode"] }
): HexTubeSweep =>
  compact({
    id,
    kind: "feature.hexTubeSweep",
    path,
    outerAcrossFlats,
    innerAcrossFlats,
    result: result ?? (opts?.mode === "surface" ? `surface:${id}` : `body:${id}`),
    deps: opts?.deps,
    mode: opts?.mode,
  });

export const mirror = (
  id: ID,
  source: Selector,
  plane: PlaneRef,
  result?: string,
  deps?: ID[]
): Mirror =>
  compact({
    id,
    kind: "feature.mirror",
    source,
    plane,
    result: result ?? `body:${id}`,
    deps,
  });

export const moveBody = (
  id: ID,
  source: Selector,
  result?: string,
  deps?: ID[],
  opts?: {
    translation?: Point3D;
    rotationAxis?: AxisSpec;
    rotationAngle?: Scalar;
    scale?: Scalar;
    origin?: Point3D;
  }
): MoveBody =>
  compact({
    id,
    kind: "feature.move.body",
    source,
    translation: opts?.translation,
    rotationAxis: opts?.rotationAxis,
    rotationAngle: opts?.rotationAngle,
    scale: opts?.scale,
    origin: opts?.origin,
    result: result ?? `body:${id}`,
    deps,
  });

export const deleteFace = (
  id: ID,
  source: Selector,
  faces: Selector,
  result?: string,
  deps?: ID[],
  opts?: { heal?: boolean }
): DeleteFace =>
  compact({
    id,
    kind: "feature.delete.face",
    source,
    faces,
    heal: opts?.heal,
    result: result ?? `body:${id}`,
    deps,
  });

export const replaceFace = (
  id: ID,
  source: Selector,
  faces: Selector,
  tool: Selector,
  result?: string,
  deps?: ID[],
  opts?: { heal?: boolean }
): ReplaceFace =>
  compact({
    id,
    kind: "feature.replace.face",
    source,
    faces,
    tool,
    heal: opts?.heal,
    result: result ?? `body:${id}`,
    deps,
  });

export const moveFace = (
  id: ID,
  source: Selector,
  faces: Selector,
  result?: string,
  deps?: ID[],
  opts?: {
    translation?: Point3D;
    rotationAxis?: AxisSpec;
    rotationAngle?: Scalar;
    scale?: Scalar;
    origin?: Point3D;
    heal?: boolean;
  }
): MoveFace =>
  compact({
    id,
    kind: "feature.move.face",
    source,
    faces,
    translation: opts?.translation,
    rotationAxis: opts?.rotationAxis,
    rotationAngle: opts?.rotationAngle,
    scale: opts?.scale,
    origin: opts?.origin,
    heal: opts?.heal,
    result: result ?? `body:${id}`,
    deps,
  });

export const splitBody = (
  id: ID,
  source: Selector,
  tool: Selector,
  result?: string,
  deps?: ID[],
  opts?: { keepTool?: boolean }
): SplitBody =>
  compact({
    id,
    kind: "feature.split.body",
    source,
    tool,
    keepTool: opts?.keepTool,
    result: result ?? `body:${id}`,
    deps,
  });

export const splitFace = (
  id: ID,
  faces: Selector,
  tool: Selector,
  result?: string,
  deps?: ID[]
): SplitFace =>
  compact({
    id,
    kind: "feature.split.face",
    faces,
    tool,
    result: result ?? `body:${id}`,
    deps,
  });

export const draft = (
  id: ID,
  source: Selector,
  faces: Selector,
  neutralPlane: PlaneRef,
  pullDirection: AxisSpec,
  angle: Scalar,
  result?: string,
  deps?: ID[]
): Draft =>
  compact({
    id,
    kind: "feature.draft",
    source,
    faces,
    neutralPlane,
    pullDirection,
    angle,
    result: result ?? `body:${id}`,
    deps,
  });

export const thicken = (
  id: ID,
  surface: Selector,
  thickness: Scalar,
  result?: string,
  deps?: ID[],
  opts?: { direction?: ThickenDirection }
): Thicken =>
  compact({
    id,
    kind: "feature.thicken",
    surface,
    thickness,
    direction: opts?.direction,
    result: result ?? `body:${id}`,
    deps,
  });

export const shell = (
  id: ID,
  source: Selector,
  thickness: Scalar,
  result?: string,
  deps?: ID[],
  opts?: { direction?: Shell["direction"]; openFaces?: Selector[] }
): Shell =>
  compact({
    id,
    kind: "feature.shell",
    source,
    thickness,
    direction: opts?.direction,
    openFaces: opts?.openFaces,
    result: result ?? `body:${id}`,
    deps,
  });

export const thread = (
  id: ID,
  axis: Thread["axis"],
  length: Scalar,
  majorDiameter: Scalar,
  pitch: Scalar,
  result?: string,
  deps?: ID[],
  opts?: {
    origin?: Point3D;
    minorDiameter?: Scalar;
    handedness?: ThreadHandedness;
    segmentsPerTurn?: Scalar;
    profileAngle?: Scalar;
    crestFlat?: Scalar;
    rootFlat?: Scalar;
  }
): Thread =>
  compact({
    id,
    kind: "feature.thread",
    axis,
    origin: opts?.origin,
    length,
    majorDiameter,
    minorDiameter: opts?.minorDiameter,
    pitch,
    handedness: opts?.handedness,
    segmentsPerTurn: opts?.segmentsPerTurn,
    profileAngle: opts?.profileAngle,
    crestFlat: opts?.crestFlat,
    rootFlat: opts?.rootFlat,
    result: result ?? `body:${id}`,
    deps,
  });

export const hole = (
  id: ID,
  onFace: Selector,
  axis: Hole["axis"],
  diameter: number,
  depth: Hole["depth"],
  opts?: {
    pattern?: PatternRef;
    position?: Point2D;
    counterbore?: Hole["counterbore"];
    countersink?: Hole["countersink"];
    deps?: ID[];
  }
): Hole =>
  compact({
    id,
    kind: "feature.hole",
    onFace,
    axis,
    diameter,
    depth,
    pattern: opts?.pattern,
    position: opts?.position,
    counterbore: opts?.counterbore,
    countersink: opts?.countersink,
    deps: opts?.deps,
  });

export const fillet = (
  id: ID,
  edges: Selector,
  radius: number,
  deps?: ID[]
): Fillet =>
  compact({
    id,
    kind: "feature.fillet",
    edges,
    radius,
    deps,
  });

export const variableFillet = (
  id: ID,
  source: Selector,
  entries: VariableFilletEntry[],
  result?: string,
  deps?: ID[]
): VariableFillet =>
  compact({
    id,
    kind: "feature.fillet.variable",
    source,
    entries,
    result: result ?? `body:${id}`,
    deps,
  });

export const chamfer = (
  id: ID,
  edges: Selector,
  distance: number,
  deps?: ID[]
): Chamfer =>
  compact({
    id,
    kind: "feature.chamfer",
    edges,
    distance,
    deps,
  });

export const variableChamfer = (
  id: ID,
  source: Selector,
  entries: VariableChamferEntry[],
  result?: string,
  deps?: ID[]
): VariableChamfer =>
  compact({
    id,
    kind: "feature.chamfer.variable",
    source,
    entries,
    result: result ?? `body:${id}`,
    deps,
  });

export const booleanOp = (
  id: ID,
  op: BooleanOp["op"],
  left: Selector,
  right: Selector,
  result?: string,
  deps?: ID[]
): BooleanOp =>
  compact({
    id,
    kind: "feature.boolean",
    op,
    left,
    right,
    result: result ?? `body:${id}`,
    deps,
  });

export const patternLinear = (
  id: ID,
  origin: Selector,
  spacing: PatternLinear["spacing"],
  count: PatternLinear["count"],
  depsOrOpts?: ID[] | { deps?: ID[]; source?: Selector; result?: string }
): PatternLinear =>
  compact(
    Array.isArray(depsOrOpts)
      ? {
          id,
          kind: "pattern.linear",
          origin,
          spacing,
          count,
          deps: depsOrOpts,
        }
      : {
          id,
          kind: "pattern.linear",
          origin,
          spacing,
          count,
          deps: depsOrOpts?.deps,
          source: depsOrOpts?.source,
          result: depsOrOpts?.result,
        }
  );

export const patternCircular = (
  id: ID,
  origin: Selector,
  axis: PatternCircular["axis"],
  count: Scalar,
  depsOrOpts?: ID[] | { deps?: ID[]; source?: Selector; result?: string }
): PatternCircular =>
  compact(
    Array.isArray(depsOrOpts)
      ? {
          id,
          kind: "pattern.circular",
          origin,
          axis,
          count,
          deps: depsOrOpts,
        }
      : {
          id,
          kind: "pattern.circular",
          origin,
          axis,
          count,
          deps: depsOrOpts?.deps,
          source: depsOrOpts?.source,
          result: depsOrOpts?.result,
        }
  );

export const profileRect = (
  width: Scalar,
  height: Scalar,
  center?: Point3D
): Profile =>
  compact({
    kind: "profile.rectangle",
    width,
    height,
    center,
  });

export const profileCircle = (
  radius: Scalar,
  center?: Point3D
): Profile =>
  compact({
    kind: "profile.circle",
    radius,
    center,
  });

export const profilePoly = (
  sides: Scalar,
  radius: Scalar,
  center?: Point3D,
  rotation?: Scalar
): Profile =>
  compact({
    kind: "profile.poly",
    sides,
    radius,
    center,
    rotation,
  });

export const profileSketchLoop = (
  loop: ID[],
  opts?: { holes?: ID[][]; open?: boolean }
): Profile =>
  compact({
    kind: "profile.sketch",
    loop,
    holes: opts?.holes,
    open: opts?.open,
  });

export const profileRef = (name: string): ProfileRef => ({
  kind: "profile.ref",
  name,
});

export const sketchProfileLoop = (
  sketchId: ID,
  profileName: string,
  loop: ID[],
  entities: SketchEntity[],
  opts?: {
    plane?: Selector;
    origin?: [number, number, number];
    deps?: ID[];
    holes?: ID[][];
    open?: boolean;
  }
): SketchProfileBundle => {
  const profile = profileSketchLoop(loop, {
    holes: opts?.holes,
    open: opts?.open,
  });
  const sketch = sketch2d(sketchId, [{ name: profileName, profile }], {
    plane: opts?.plane,
    origin: opts?.origin,
    deps: opts?.deps,
    entities,
  });
  return { sketch, profile: profileRef(profileName) };
};

export const selectorFace = (
  predicates: Predicate[],
  rank: RankRule[] = []
): FaceQuery => ({
  kind: "selector.face",
  predicates,
  rank,
});

export const selectorEdge = (
  predicates: Predicate[],
  rank: RankRule[] = []
): EdgeQuery => ({
  kind: "selector.edge",
  predicates,
  rank,
});

export const selectorSolid = (
  predicates: Predicate[],
  rank: RankRule[] = []
): SolidQuery => ({
  kind: "selector.solid",
  predicates,
  rank,
});

export const selectorNamed = (name: string): NamedOutput => ({
  kind: "selector.named",
  name,
});

export const predNormal = (value: AxisDirection): Predicate => ({
  kind: "pred.normal",
  value,
});

export const predPlanar = (): Predicate => ({ kind: "pred.planar" });

export const predCreatedBy = (featureId: ID): Predicate => ({
  kind: "pred.createdBy",
  featureId,
});

export const predRole = (value: string): Predicate => ({
  kind: "pred.role",
  value,
});

export const rankMaxArea = (): RankRule => ({ kind: "rank.maxArea" });

export const rankMinZ = (): RankRule => ({ kind: "rank.minZ" });

export const rankMaxZ = (): RankRule => ({ kind: "rank.maxZ" });

export const rankClosestTo = (target: Selector): RankRule => ({
  kind: "rank.closestTo",
  target,
});

export const axisVector = (direction: Point3D): AxisSpec => ({
  kind: "axis.vector",
  direction,
});

export const axisDatum = (ref: ID): AxisSpec => ({
  kind: "axis.datum",
  ref,
});

export const axisSketchNormal = (): ExtrudeAxis => ({
  kind: "axis.sketch.normal",
});

export const planeDatum = (ref: ID): PlaneRef => ({
  kind: "plane.datum",
  ref,
});

export const pathPolyline = (
  points: Point3D[],
  opts?: { closed?: boolean }
): Path3D => compact({ kind: "path.polyline", points, closed: opts?.closed });

export const pathSpline = (
  points: Point3D[],
  opts?: { closed?: boolean; degree?: Scalar }
): Path3D =>
  compact({
    kind: "path.spline",
    points,
    closed: opts?.closed,
    degree: opts?.degree,
  });

export const pathSegments = (segments: PathSegment[]): Path3D => ({
  kind: "path.segments",
  segments,
});

export const pathLine = (start: Point3D, end: Point3D): PathSegment => ({
  kind: "path.line",
  start,
  end,
});

export const pathArc = (
  start: Point3D,
  end: Point3D,
  center: Point3D,
  direction?: "cw" | "ccw"
): PathSegment => compact({ kind: "path.arc", start, end, center, direction });
