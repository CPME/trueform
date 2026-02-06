export type ID = string;

export type LengthUnit = "mm" | "cm" | "m" | "in";
export type AngleUnit = "rad" | "deg";
export type Unit = LengthUnit | AngleUnit;
export type Units = LengthUnit;

export type AxisDirection = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";

export type ParamType = "length" | "angle" | "count";

export type Expr =
  | { kind: "expr.literal"; value: number; unit?: Unit }
  | { kind: "expr.param"; id: ID }
  | { kind: "expr.binary"; op: "+" | "-" | "*" | "/"; left: Expr; right: Expr }
  | { kind: "expr.neg"; value: Expr };

export type Scalar = number | Expr;
export type Point2D = [Scalar, Scalar];

export type ParamDef = {
  id: ID;
  type: ParamType;
  value: Expr;
};

export type BuildContext = {
  units: Units;
  kernel: {
    name: string;
    version: string;
  };
  tolerance: {
    linear: number;
    angular: number;
  };
};

export type IntentDocument = {
  id: ID;
  parts: IntentPart[];
  assemblies?: IntentAssembly[];
  capabilities?: Record<string, unknown>;
  constraints?: unknown[];
  assertions?: unknown[];
  context: BuildContext;
};

export type IntentPart = {
  id: ID;
  features: IntentFeature[];
  params?: ParamDef[];
  constraints?: unknown[];
  assertions?: unknown[];
};

export type IntentAssembly = {
  id: ID;
  instances: AssemblyInstance[];
  mates?: AssemblyMate[];
  outputs?: AssemblyOutput[];
};

export type AssemblyInstance = {
  id: ID;
  part: ID;
  transform?: Transform;
  tags?: string[];
};

export type Transform = {
  translation?: [number, number, number];
  rotation?: [number, number, number];
  // 4x4 column-major matrix, length 16 when provided.
  matrix?: number[];
};

export type AssemblyRef = {
  instance: ID;
  selector: Selector;
};

export type AssemblyMate =
  | { kind: "mate.fixed"; a: AssemblyRef; b: AssemblyRef }
  | { kind: "mate.coaxial"; a: AssemblyRef; b: AssemblyRef }
  | { kind: "mate.planar"; a: AssemblyRef; b: AssemblyRef; offset?: number };

export type AssemblyOutput = {
  name: string;
  refs: AssemblyRef[];
};

export type IntentFeature =
  | DatumPlane
  | DatumAxis
  | DatumFrame
  | Sketch2D
  | Extrude
  | Revolve
  | Hole
  | Fillet
  | Chamfer
  | BooleanOp
  | PatternLinear
  | PatternCircular;

export type FeatureBase = {
  id: ID;
  kind: string;
  deps?: ID[];
};

export type DatumPlane = FeatureBase & {
  kind: "datum.plane";
  normal: AxisDirection;
  origin?: [number, number, number];
};

export type DatumAxis = FeatureBase & {
  kind: "datum.axis";
  direction: AxisDirection;
  origin?: [number, number, number];
};

export type DatumFrame = FeatureBase & {
  kind: "datum.frame";
  on: Selector;
};

export type Sketch2D = FeatureBase & {
  kind: "feature.sketch2d";
  plane?: Selector;
  origin?: [number, number, number];
  entities?: SketchEntity[];
  profiles: SketchProfile[];
};

export type SketchProfile = {
  name: string;
  profile: Profile;
};

export type SketchEntityBase = {
  id: ID;
  kind: string;
  construction?: boolean;
};

export type SketchLine = SketchEntityBase & {
  kind: "sketch.line";
  start: Point2D;
  end: Point2D;
};

export type SketchArc = SketchEntityBase & {
  kind: "sketch.arc";
  start: Point2D;
  end: Point2D;
  center: Point2D;
  direction: "cw" | "ccw";
};

export type SketchCircle = SketchEntityBase & {
  kind: "sketch.circle";
  center: Point2D;
  radius: Scalar;
};

export type SketchEllipse = SketchEntityBase & {
  kind: "sketch.ellipse";
  center: Point2D;
  radiusX: Scalar;
  radiusY: Scalar;
  rotation?: Scalar;
};

export type SketchRectangle =
  | (SketchEntityBase & {
      kind: "sketch.rectangle";
      mode: "center";
      center: Point2D;
      width: Scalar;
      height: Scalar;
      rotation?: Scalar;
    })
  | (SketchEntityBase & {
      kind: "sketch.rectangle";
      mode: "corner";
      corner: Point2D;
      width: Scalar;
      height: Scalar;
      rotation?: Scalar;
    });

export type SketchSlot = SketchEntityBase & {
  kind: "sketch.slot";
  center: Point2D;
  length: Scalar;
  width: Scalar;
  rotation?: Scalar;
  endStyle?: "arc" | "straight";
};

export type SketchPolygon = SketchEntityBase & {
  kind: "sketch.polygon";
  center: Point2D;
  radius: Scalar;
  sides: Scalar;
  rotation?: Scalar;
};

export type SketchSpline = SketchEntityBase & {
  kind: "sketch.spline";
  points: Point2D[];
  closed?: boolean;
  degree?: Scalar;
};

export type SketchPoint = SketchEntityBase & {
  kind: "sketch.point";
  point: Point2D;
};

export type SketchEntity =
  | SketchLine
  | SketchArc
  | SketchCircle
  | SketchEllipse
  | SketchRectangle
  | SketchSlot
  | SketchPolygon
  | SketchSpline
  | SketchPoint;

export type Extrude = FeatureBase & {
  kind: "feature.extrude";
  profile: ProfileRef;
  depth: Scalar | "throughAll";
  result: string;
};

export type Revolve = FeatureBase & {
  kind: "feature.revolve";
  profile: ProfileRef;
  axis: AxisDirection;
  angle?: Scalar | "full";
  origin?: [number, number, number];
  result: string;
};

export type Hole = FeatureBase & {
  kind: "feature.hole";
  onFace: Selector;
  axis: AxisDirection;
  diameter: Scalar;
  depth: Scalar | "throughAll";
  pattern?: PatternRef;
};

export type Fillet = FeatureBase & {
  kind: "feature.fillet";
  edges: Selector;
  radius: Scalar;
};

export type Chamfer = FeatureBase & {
  kind: "feature.chamfer";
  edges: Selector;
  distance: Scalar;
};

export type BooleanOp = FeatureBase & {
  kind: "feature.boolean";
  op: "union" | "subtract" | "intersect";
  left: Selector;
  right: Selector;
  result: string;
};

export type PatternLinear = FeatureBase & {
  kind: "pattern.linear";
  origin: Selector;
  spacing: [Scalar, Scalar];
  count: [Scalar, Scalar];
};

export type PatternCircular = FeatureBase & {
  kind: "pattern.circular";
  origin: Selector;
  axis: AxisDirection;
  count: Scalar;
};

export type PatternRef =
  | { kind: "pattern.linear"; ref: ID }
  | { kind: "pattern.circular"; ref: ID };

export type Profile =
  | {
      kind: "profile.rectangle";
      width: Scalar;
      height: Scalar;
      center?: [number, number, number];
    }
  | {
      kind: "profile.circle";
      radius: Scalar;
      center?: [number, number, number];
    };

export type ProfileRef =
  | Profile
  | {
      kind: "profile.ref";
      name: string;
    };

export type Selector = FaceQuery | EdgeQuery | SolidQuery | NamedOutput;

export type FaceQuery = {
  kind: "selector.face";
  predicates: Predicate[];
  rank: RankRule[];
};

export type EdgeQuery = {
  kind: "selector.edge";
  predicates: Predicate[];
  rank: RankRule[];
};

export type SolidQuery = {
  kind: "selector.solid";
  predicates: Predicate[];
  rank: RankRule[];
};

export type NamedOutput = {
  kind: "selector.named";
  name: string;
};

export type Predicate =
  | { kind: "pred.normal"; value: AxisDirection }
  | { kind: "pred.planar" }
  | { kind: "pred.createdBy"; featureId: ID }
  | { kind: "pred.role"; value: string };

export type RankRule =
  | { kind: "rank.maxArea" }
  | { kind: "rank.minZ" }
  | { kind: "rank.maxZ" }
  | { kind: "rank.closestTo"; target: Selector };

export type CompileResult = {
  partId: ID;
  featureOrder: ID[];
  graph: Graph;
};

export type Graph = {
  nodes: ID[];
  edges: Array<{ from: ID; to: ID }>;
};

export type DslHelpers = {
  /** Create a build context with optional overrides. */
  context: (overrides?: Partial<BuildContext>) => BuildContext;
  /** Create a document containing parts and optional assemblies. */
  document: (
    id: ID,
    parts: IntentPart[],
    context?: BuildContext,
    assemblies?: IntentAssembly[],
    opts?: {
      capabilities?: IntentDocument["capabilities"];
      constraints?: IntentDocument["constraints"];
      assertions?: IntentDocument["assertions"];
    }
  ) => IntentDocument;
  /** Create a part from a list of features. */
  part: (
    id: ID,
    features: IntentFeature[],
    opts?: {
      params?: ParamDef[];
      constraints?: IntentPart["constraints"];
      assertions?: IntentPart["assertions"];
    }
  ) => IntentPart;
  /** Define a length parameter. */
  paramLength: (id: ID, value: Expr) => ParamDef;
  /** Define an angle parameter. */
  paramAngle: (id: ID, value: Expr) => ParamDef;
  /** Define a count parameter. */
  paramCount: (id: ID, value: Expr) => ParamDef;
  /** Create a literal expression. */
  exprLiteral: (value: number, unit?: Unit) => Expr;
  /** Reference a parameter by id. */
  exprParam: (id: ID) => Expr;
  /** Add two expressions. */
  exprAdd: (left: Expr, right: Expr) => Expr;
  /** Subtract two expressions. */
  exprSub: (left: Expr, right: Expr) => Expr;
  /** Multiply two expressions. */
  exprMul: (left: Expr, right: Expr) => Expr;
  /** Divide two expressions. */
  exprDiv: (left: Expr, right: Expr) => Expr;
  /** Negate an expression. */
  exprNeg: (value: Expr) => Expr;
  /** Create an assembly (data-only in v1). */
  assembly: (
    id: ID,
    instances: AssemblyInstance[],
    opts?: { mates?: AssemblyMate[]; outputs?: AssemblyOutput[] }
  ) => IntentAssembly;
  /** Create an assembly instance of a part. */
  assemblyInstance: (
    id: ID,
    part: ID,
    transform?: Transform,
    tags?: string[]
  ) => AssemblyInstance;
  /** Build a transform (translation, rotation, or matrix). */
  transform: (opts?: Transform) => Transform;
  /** Reference geometry in an assembly instance. */
  assemblyRef: (instance: ID, selector: Selector) => AssemblyRef;
  /** Create a fixed mate between two assembly refs. */
  mateFixed: (a: AssemblyRef, b: AssemblyRef) => AssemblyMate;
  /** Create a coaxial mate between two assembly refs. */
  mateCoaxial: (a: AssemblyRef, b: AssemblyRef) => AssemblyMate;
  /** Create a planar mate between two assembly refs. */
  matePlanar: (a: AssemblyRef, b: AssemblyRef, offset?: number) => AssemblyMate;
  /** Create a named assembly output. */
  assemblyOutput: (name: string, refs: AssemblyRef[]) => AssemblyOutput;
  /** Create a datum plane. */
  datumPlane: (
    id: ID,
    normal: DatumPlane["normal"],
    origin?: DatumPlane["origin"],
    deps?: ID[]
  ) => DatumPlane;
  /** Create a datum axis. */
  datumAxis: (
    id: ID,
    direction: DatumAxis["direction"],
    origin?: DatumAxis["origin"],
    deps?: ID[]
  ) => DatumAxis;
  /** Create a datum frame from a selector. */
  datumFrame: (id: ID, on: Selector, deps?: ID[]) => DatumFrame;
  /** Create a 2D sketch with profiles on an optional plane. */
  sketch2d: (
    id: ID,
    profiles: SketchProfile[],
    opts?: {
      plane?: Selector;
      origin?: [number, number, number];
      deps?: ID[];
      entities?: SketchEntity[];
    }
  ) => Sketch2D;
  /** Create a sketch line entity. */
  sketchLine: (
    id: ID,
    start: Point2D,
    end: Point2D,
    opts?: { construction?: boolean }
  ) => SketchLine;
  /** Create a sketch arc entity. */
  sketchArc: (
    id: ID,
    start: Point2D,
    end: Point2D,
    center: Point2D,
    direction: SketchArc["direction"],
    opts?: { construction?: boolean }
  ) => SketchArc;
  /** Create a sketch circle entity. */
  sketchCircle: (
    id: ID,
    center: Point2D,
    radius: Scalar,
    opts?: { construction?: boolean }
  ) => SketchCircle;
  /** Create a sketch ellipse entity. */
  sketchEllipse: (
    id: ID,
    center: Point2D,
    radiusX: Scalar,
    radiusY: Scalar,
    opts?: { rotation?: Scalar; construction?: boolean }
  ) => SketchEllipse;
  /** Create a centered sketch rectangle entity. */
  sketchRectCenter: (
    id: ID,
    center: Point2D,
    width: Scalar,
    height: Scalar,
    opts?: { rotation?: Scalar; construction?: boolean }
  ) => SketchRectangle;
  /** Create a corner-based sketch rectangle entity. */
  sketchRectCorner: (
    id: ID,
    corner: Point2D,
    width: Scalar,
    height: Scalar,
    opts?: { rotation?: Scalar; construction?: boolean }
  ) => SketchRectangle;
  /** Create a sketch slot entity. */
  sketchSlot: (
    id: ID,
    center: Point2D,
    length: Scalar,
    width: Scalar,
    opts?: { rotation?: Scalar; endStyle?: SketchSlot["endStyle"]; construction?: boolean }
  ) => SketchSlot;
  /** Create a sketch polygon entity. */
  sketchPolygon: (
    id: ID,
    center: Point2D,
    radius: Scalar,
    sides: Scalar,
    opts?: { rotation?: Scalar; construction?: boolean }
  ) => SketchPolygon;
  /** Create a sketch spline entity. */
  sketchSpline: (
    id: ID,
    points: Point2D[],
    opts?: { closed?: boolean; degree?: Scalar; construction?: boolean }
  ) => SketchSpline;
  /** Create a sketch point entity. */
  sketchPoint: (
    id: ID,
    point: Point2D,
    opts?: { construction?: boolean }
  ) => SketchPoint;
  /** Extrude a profile into a solid or cut. */
  extrude: (
    id: ID,
    profile: ProfileRef,
    depth: Extrude["depth"],
    result?: string,
    deps?: ID[]
  ) => Extrude;
  /** Revolve a profile around an axis. */
  revolve: (
    id: ID,
    profile: ProfileRef,
    axis: Revolve["axis"],
    angle: Revolve["angle"],
    result?: string,
    opts?: { origin?: [number, number, number]; deps?: ID[] }
  ) => Revolve;
  /** Create a hole feature on a face with axis and depth. */
  hole: (
    id: ID,
    onFace: Selector,
    axis: Hole["axis"],
    diameter: number,
    depth: Hole["depth"],
    opts?: { pattern?: PatternRef; deps?: ID[] }
  ) => Hole;
  /** Apply a constant-radius fillet to selected edges. */
  fillet: (id: ID, edges: Selector, radius: number, deps?: ID[]) => Fillet;
  /** Apply a chamfer to selected edges. */
  chamfer: (id: ID, edges: Selector, distance: number, deps?: ID[]) => Chamfer;
  /** Boolean combine two selectors into a result body. */
  booleanOp: (
    id: ID,
    op: BooleanOp["op"],
    left: Selector,
    right: Selector,
    result?: string,
    deps?: ID[]
  ) => BooleanOp;
  /** Create a linear pattern. */
  patternLinear: (
    id: ID,
    origin: Selector,
    spacing: PatternLinear["spacing"],
    count: PatternLinear["count"],
    deps?: ID[]
  ) => PatternLinear;
  /** Create a circular pattern. */
  patternCircular: (
    id: ID,
    origin: Selector,
    axis: PatternCircular["axis"],
    count: Scalar,
    deps?: ID[]
  ) => PatternCircular;
  /** Create a rectangle profile. */
  profileRect: (
    width: Scalar,
    height: Scalar,
    center?: [number, number, number]
  ) => Profile;
  /** Create a circle profile. */
  profileCircle: (radius: Scalar, center?: [number, number, number]) => Profile;
  /** Reference a named profile from a sketch. */
  profileRef: (name: string) => ProfileRef;
  /** Create a face selector. */
  selectorFace: (predicates: Predicate[], rank?: RankRule[]) => FaceQuery;
  /** Create an edge selector. */
  selectorEdge: (predicates: Predicate[], rank?: RankRule[]) => EdgeQuery;
  /** Create a solid selector. */
  selectorSolid: (predicates: Predicate[], rank?: RankRule[]) => SolidQuery;
  /** Reference a named output selector. */
  selectorNamed: (name: string) => NamedOutput;
  /** Predicate for face/edge normal. */
  predNormal: (value: AxisDirection) => Predicate;
  /** Predicate for planar faces. */
  predPlanar: () => Predicate;
  /** Predicate for feature ownership. */
  predCreatedBy: (featureId: ID) => Predicate;
  /** Predicate for semantic role tags. */
  predRole: (value: string) => Predicate;
  /** Ranking rule by maximum area. */
  rankMaxArea: () => RankRule;
  /** Ranking rule by minimum Z. */
  rankMinZ: () => RankRule;
  /** Ranking rule by maximum Z. */
  rankMaxZ: () => RankRule;
  /** Ranking rule by distance to a target selector. */
  rankClosestTo: (target: Selector) => RankRule;
};

function compact<T extends Record<string, unknown>>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) result[key] = entry;
  }
  return result as T;
}

export const dsl: DslHelpers = {
  context: (overrides = {}) => ({
    units: overrides.units ?? "mm",
    kernel: {
      name: overrides.kernel?.name ?? "opencascade.js",
      version: overrides.kernel?.version ?? "unknown",
    },
    tolerance: {
      linear: overrides.tolerance?.linear ?? 0.01,
      angular: overrides.tolerance?.angular ?? 0.001,
    },
  }),
  document: (id, parts, context, assemblies, opts) =>
    compact({
      id,
      parts,
      assemblies,
      context: context ?? dsl.context(),
      capabilities: opts?.capabilities,
      constraints: opts?.constraints,
      assertions: opts?.assertions,
    }),
  part: (id, features, opts) =>
    compact({
      id,
      features,
      params: opts?.params,
      constraints: opts?.constraints,
      assertions: opts?.assertions,
    }),
  paramLength: (id, value) => ({ id, type: "length", value }),
  paramAngle: (id, value) => ({ id, type: "angle", value }),
  paramCount: (id, value) => ({ id, type: "count", value }),
  exprLiteral: (value, unit) => (unit ? { kind: "expr.literal", value, unit } : { kind: "expr.literal", value }),
  exprParam: (id) => ({ kind: "expr.param", id }),
  exprAdd: (left, right) => ({ kind: "expr.binary", op: "+", left, right }),
  exprSub: (left, right) => ({ kind: "expr.binary", op: "-", left, right }),
  exprMul: (left, right) => ({ kind: "expr.binary", op: "*", left, right }),
  exprDiv: (left, right) => ({ kind: "expr.binary", op: "/", left, right }),
  exprNeg: (value) => ({ kind: "expr.neg", value }),
  assembly: (id, instances, opts) => ({
    id,
    instances,
    mates: opts?.mates,
    outputs: opts?.outputs,
  }),
  assemblyInstance: (id, part, transform, tags) => ({
    id,
    part,
    transform,
    tags,
  }),
  transform: (opts = {}) => ({
    translation: opts.translation,
    rotation: opts.rotation,
    matrix: opts.matrix,
  }),
  assemblyRef: (instance, selector) => ({ instance, selector }),
  mateFixed: (a, b) => ({ kind: "mate.fixed", a, b }),
  mateCoaxial: (a, b) => ({ kind: "mate.coaxial", a, b }),
  matePlanar: (a, b, offset) => ({ kind: "mate.planar", a, b, offset }),
  assemblyOutput: (name, refs) => ({ name, refs }),
  datumPlane: (id, normal, origin, deps) =>
    compact({
      id,
      kind: "datum.plane",
      normal,
      origin,
      deps,
    }),
  datumAxis: (id, direction, origin, deps) =>
    compact({
      id,
      kind: "datum.axis",
      direction,
      origin,
      deps,
    }),
  datumFrame: (id, on, deps) => compact({ id, kind: "datum.frame", on, deps }),
  sketch2d: (id, profiles, opts) =>
    compact({
      id,
      kind: "feature.sketch2d",
      profiles,
      plane: opts?.plane,
      origin: opts?.origin,
      deps: opts?.deps,
      entities: opts?.entities,
    }),
  sketchLine: (id, start, end, opts) =>
    compact({
      id,
      kind: "sketch.line",
      start,
      end,
      construction: opts?.construction,
    }),
  sketchArc: (id, start, end, center, direction, opts) =>
    compact({
      id,
      kind: "sketch.arc",
      start,
      end,
      center,
      direction,
      construction: opts?.construction,
    }),
  sketchCircle: (id, center, radius, opts) =>
    compact({
      id,
      kind: "sketch.circle",
      center,
      radius,
      construction: opts?.construction,
    }),
  sketchEllipse: (id, center, radiusX, radiusY, opts) =>
    compact({
      id,
      kind: "sketch.ellipse",
      center,
      radiusX,
      radiusY,
      rotation: opts?.rotation,
      construction: opts?.construction,
    }),
  sketchRectCenter: (id, center, width, height, opts) =>
    compact({
      id,
      kind: "sketch.rectangle",
      mode: "center",
      center,
      width,
      height,
      rotation: opts?.rotation,
      construction: opts?.construction,
    }),
  sketchRectCorner: (id, corner, width, height, opts) =>
    compact({
      id,
      kind: "sketch.rectangle",
      mode: "corner",
      corner,
      width,
      height,
      rotation: opts?.rotation,
      construction: opts?.construction,
    }),
  sketchSlot: (id, center, length, width, opts) =>
    compact({
      id,
      kind: "sketch.slot",
      center,
      length,
      width,
      rotation: opts?.rotation,
      endStyle: opts?.endStyle,
      construction: opts?.construction,
    }),
  sketchPolygon: (id, center, radius, sides, opts) =>
    compact({
      id,
      kind: "sketch.polygon",
      center,
      radius,
      sides,
      rotation: opts?.rotation,
      construction: opts?.construction,
    }),
  sketchSpline: (id, points, opts) =>
    compact({
      id,
      kind: "sketch.spline",
      points,
      closed: opts?.closed,
      degree: opts?.degree,
      construction: opts?.construction,
    }),
  sketchPoint: (id, point, opts) =>
    compact({
      id,
      kind: "sketch.point",
      point,
      construction: opts?.construction,
    }),
  extrude: (id, profile, depth, result, deps) =>
    compact({
      id,
      kind: "feature.extrude",
      profile,
      depth,
      result: result ?? `body:${id}`,
      deps,
    }),
  revolve: (id, profile, axis, angle, result, opts) =>
    compact({
      id,
      kind: "feature.revolve",
      profile,
      axis,
      angle,
      origin: opts?.origin,
      result: result ?? `body:${id}`,
      deps: opts?.deps,
    }),
  hole: (id, onFace, axis, diameter, depth, opts) =>
    compact({
      id,
      kind: "feature.hole",
      onFace,
      axis,
      diameter,
      depth,
      pattern: opts?.pattern,
      deps: opts?.deps,
    }),
  fillet: (id, edges, radius, deps) =>
    compact({
      id,
      kind: "feature.fillet",
      edges,
      radius,
      deps,
    }),
  chamfer: (id, edges, distance, deps) =>
    compact({
      id,
      kind: "feature.chamfer",
      edges,
      distance,
      deps,
    }),
  booleanOp: (id, op, left, right, result, deps) =>
    compact({
      id,
      kind: "feature.boolean",
      op,
      left,
      right,
      result: result ?? `body:${id}`,
      deps,
    }),
  patternLinear: (id, origin, spacing, count, deps) =>
    compact({
      id,
      kind: "pattern.linear",
      origin,
      spacing,
      count,
      deps,
    }),
  patternCircular: (id, origin, axis, count, deps) =>
    compact({
      id,
      kind: "pattern.circular",
      origin,
      axis,
      count,
      deps,
    }),
  profileRect: (width, height, center) =>
    compact({
      kind: "profile.rectangle",
      width,
      height,
      center,
    }),
  profileCircle: (radius, center) =>
    compact({
      kind: "profile.circle",
      radius,
      center,
    }),
  profileRef: (name) => ({ kind: "profile.ref", name }),
  selectorFace: (predicates, rank = []) => ({
    kind: "selector.face",
    predicates,
    rank,
  }),
  selectorEdge: (predicates, rank = []) => ({
    kind: "selector.edge",
    predicates,
    rank,
  }),
  selectorSolid: (predicates, rank = []) => ({
    kind: "selector.solid",
    predicates,
    rank,
  }),
  selectorNamed: (name) => ({ kind: "selector.named", name }),
  predNormal: (value) => ({ kind: "pred.normal", value }),
  predPlanar: () => ({ kind: "pred.planar" }),
  predCreatedBy: (featureId) => ({ kind: "pred.createdBy", featureId }),
  predRole: (value) => ({ kind: "pred.role", value }),
  rankMaxArea: () => ({ kind: "rank.maxArea" }),
  rankMinZ: () => ({ kind: "rank.minZ" }),
  rankMaxZ: () => ({ kind: "rank.maxZ" }),
  rankClosestTo: (target) => ({ kind: "rank.closestTo", target }),
};

export const {
  context,
  document,
  part,
  paramLength,
  paramAngle,
  paramCount,
  exprLiteral,
  exprParam,
  exprAdd,
  exprSub,
  exprMul,
  exprDiv,
  exprNeg,
  assembly,
  assemblyInstance,
  transform,
  assemblyRef,
  mateFixed,
  mateCoaxial,
  matePlanar,
  assemblyOutput,
  datumPlane,
  datumAxis,
  datumFrame,
  sketch2d,
  sketchLine,
  sketchArc,
  sketchCircle,
  sketchEllipse,
  sketchRectCenter,
  sketchRectCorner,
  sketchSlot,
  sketchPolygon,
  sketchSpline,
  sketchPoint,
  extrude,
  revolve,
  hole,
  fillet,
  chamfer,
  booleanOp,
  patternLinear,
  patternCircular,
  profileRect,
  profileCircle,
  profileRef,
  selectorFace,
  selectorEdge,
  selectorSolid,
  selectorNamed,
  predNormal,
  predPlanar,
  predCreatedBy,
  predRole,
  rankMaxArea,
  rankMinZ,
  rankMaxZ,
  rankClosestTo,
} = dsl;
