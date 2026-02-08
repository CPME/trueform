import {
  context,
  document,
  exprAdd,
  exprDiv,
  exprLiteral,
  exprMul,
  exprNeg,
  exprParam,
  exprSub,
  paramAngle,
  paramCount,
  paramLength,
  part,
  withTags,
} from "./dsl/core.js";
import {
  assembly,
  connector as mateConnector,
  instance as assemblyInstance,
  mateCoaxial,
  mateFixed,
  matePlanar,
  output as assemblyOutput,
  ref as assemblyRef,
  transform,
} from "./dsl/assembly.js";
import {
  axisDatum,
  axisSketchNormal,
  axisVector,
  booleanOp,
  chamfer,
  datumAxis,
  datumFrame,
  datumPlane,
  extrude,
  fillet,
  hole,
  loft,
  pathArc,
  pathLine,
  pathPolyline,
  pathSpline,
  pathSegments,
  patternCircular,
  patternLinear,
  pipe,
  pipeSweep,
  hexTubeSweep,
  planeDatum,
  predCreatedBy,
  predNormal,
  predPlanar,
  predRole,
  profileCircle,
  profilePoly,
  profileRect,
  profileRef,
  profileSketchLoop,
  rankClosestTo,
  rankMaxArea,
  rankMaxZ,
  rankMinZ,
  revolve,
  selectorEdge,
  selectorFace,
  selectorNamed,
  selectorSolid,
  sketch2d,
  sketchArc,
  sketchCircle,
  sketchEllipse,
  sketchLine,
  sketchPoint,
  sketchPolygon,
  sketchProfileLoop,
  sketchRectCenter,
  sketchRectCorner,
  sketchSlot,
  sketchSpline,
} from "./dsl/geometry.js";
import {
  featureArray,
  sketchArray,
  featureCircularArray,
  sketchCircularArray,
  featureRadialArray,
  sketchRadialArray,
  featureArrayAlongSpline,
  sketchArrayAlongSpline,
} from "./dsl/generators.js";
import type {
  FeatureArrayItem,
  FeatureArrayLayout,
  CircularArrayItem2D,
  CircularArrayItem3D,
  CircularArrayLayout2D,
  CircularArrayLayout3D,
  RadialArrayItem2D,
  RadialArrayItem3D,
  RadialArrayLayout2D,
  RadialArrayLayout3D,
  SplineArrayItem2D,
  SplineArrayItem3D,
  SplineArrayLayout2D,
  SplineArrayLayout3D,
  SketchArrayItem,
  SketchArrayLayout,
} from "./dsl/generators.js";
import {
  refFrame,
  refSurface,
  surfaceProfileConstraint,
} from "./dsl/tolerancing.js";

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
export type Point3D = [Scalar, Scalar, Scalar];

export type AxisSpec =
  | AxisDirection
  | { kind: "axis.vector"; direction: Point3D }
  | { kind: "axis.datum"; ref: ID };

export type ExtrudeAxis = AxisSpec | { kind: "axis.sketch.normal" };

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
  constraints?: FTIConstraint[];
  assertions?: unknown[];
  context: BuildContext;
};

export type IntentPart = {
  id: ID;
  features: IntentFeature[];
  params?: ParamDef[];
  connectors?: MateConnector[];
  constraints?: FTIConstraint[];
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
  // Rotation in degrees, applied in X/Y/Z order.
  rotation?: [number, number, number];
  // 4x4 column-major matrix, length 16 when provided.
  matrix?: number[];
};

export type AssemblyRef = {
  instance: ID;
  connector: ID;
};

export type AssemblyMate =
  | { kind: "mate.fixed"; a: AssemblyRef; b: AssemblyRef }
  | { kind: "mate.coaxial"; a: AssemblyRef; b: AssemblyRef }
  | { kind: "mate.planar"; a: AssemblyRef; b: AssemblyRef; offset?: number };

export type AssemblyOutput = {
  name: string;
  refs: AssemblyRef[];
};

export type MateConnector = {
  id: ID;
  origin: Selector;
  normal?: AxisDirection;
  xAxis?: AxisDirection;
};

export type IntentFeature =
  | DatumPlane
  | DatumAxis
  | DatumFrame
  | Sketch2D
  | Extrude
  | Revolve
  | Loft
  | Pipe
  | PipeSweep
  | HexTubeSweep
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
  tags?: string[];
};

export type DatumPlane = FeatureBase & {
  kind: "datum.plane";
  normal: AxisSpec;
  origin?: [number, number, number];
  xAxis?: AxisSpec;
};

export type DatumAxis = FeatureBase & {
  kind: "datum.axis";
  direction: AxisSpec;
  origin?: [number, number, number];
};

export type DatumFrame = FeatureBase & {
  kind: "datum.frame";
  on: Selector;
};

export type Sketch2D = FeatureBase & {
  kind: "feature.sketch2d";
  plane?: PlaneRef;
  origin?: [number, number, number];
  entities?: SketchEntity[];
  profiles: SketchProfile[];
};

export type SketchProfile = {
  name: string;
  profile: Profile;
};

export type SketchProfileBundle = {
  sketch: Sketch2D;
  profile: ProfileRef;
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

export type PathSegment =
  | { kind: "path.line"; start: Point3D; end: Point3D }
  | {
      kind: "path.arc";
      start: Point3D;
      end: Point3D;
      center: Point3D;
      direction?: "cw" | "ccw";
    };

export type Path3D =
  | { kind: "path.polyline"; points: Point3D[]; closed?: boolean }
  | { kind: "path.spline"; points: Point3D[]; closed?: boolean; degree?: Scalar }
  | { kind: "path.segments"; segments: PathSegment[] };

export type Extrude = FeatureBase & {
  kind: "feature.extrude";
  profile: ProfileRef;
  depth: Scalar | "throughAll";
  result: string;
  axis?: ExtrudeAxis;
};

export type Revolve = FeatureBase & {
  kind: "feature.revolve";
  profile: ProfileRef;
  axis: AxisDirection;
  angle?: Scalar | "full";
  origin?: [number, number, number];
  result: string;
};

export type Loft = FeatureBase & {
  kind: "feature.loft";
  profiles: ProfileRef[];
  result: string;
};

export type Pipe = FeatureBase & {
  kind: "feature.pipe";
  axis: AxisDirection;
  origin?: Point3D;
  length: Scalar;
  outerDiameter: Scalar;
  innerDiameter?: Scalar;
  result: string;
};

export type PipeSweep = FeatureBase & {
  kind: "feature.pipeSweep";
  path: Path3D;
  outerDiameter: Scalar;
  innerDiameter?: Scalar;
  result: string;
};

export type HexTubeSweep = FeatureBase & {
  kind: "feature.hexTubeSweep";
  path: Path3D;
  outerAcrossFlats: Scalar;
  innerAcrossFlats?: Scalar;
  result: string;
};

export type Hole = FeatureBase & {
  kind: "feature.hole";
  onFace: Selector;
  axis: AxisDirection;
  diameter: Scalar;
  depth: Scalar | "throughAll";
  pattern?: PatternRef;
  position?: Point2D;
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
      center?: Point3D;
    }
  | {
      kind: "profile.circle";
      radius: Scalar;
      center?: Point3D;
    }
  | {
      kind: "profile.poly";
      sides: Scalar;
      radius: Scalar;
      center?: Point3D;
      rotation?: Scalar;
    }
  | {
      kind: "profile.sketch";
      loop: ID[];
      holes?: ID[][];
      open?: boolean;
    };

export type ProfileRef =
  | Profile
  | {
      kind: "profile.ref";
      name: string;
    };

export type Selector = FaceQuery | EdgeQuery | SolidQuery | NamedOutput;

export type GeometryRef = RefSurface | RefFrame;

export type RefSurface = {
  kind: "ref.surface";
  selector: Selector;
};

export type RefFrame = {
  kind: "ref.frame";
  selector: Selector;
};

export type SurfaceProfileConstraint = {
  id: ID;
  kind: "constraint.surfaceProfile";
  target: RefSurface;
  tolerance: Scalar;
  referenceFrame?: RefFrame;
  capabilities?: ID[];
  requirement?: ID;
};

export type FTIConstraint = SurfaceProfileConstraint;

export type PlaneRef = Selector | { kind: "plane.datum"; ref: ID };

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
      connectors?: MateConnector[];
      constraints?: IntentPart["constraints"];
      assertions?: IntentPart["assertions"];
    }
  ) => IntentPart;
  /** Attach semantic tags to a feature. */
  withTags: <T extends IntentFeature>(feature: T, tags: string[]) => T;
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
  /** Build a transform matrix (rotation in degrees, applied X/Y/Z). */
  transform: (opts?: Transform) => Transform;
  /** Reference a mate connector in an assembly instance. */
  assemblyRef: (instance: ID, connector: ID) => AssemblyRef;
  /** Create a fixed mate between two assembly refs. */
  mateFixed: (a: AssemblyRef, b: AssemblyRef) => AssemblyMate;
  /** Create a coaxial mate between two assembly refs. */
  mateCoaxial: (a: AssemblyRef, b: AssemblyRef) => AssemblyMate;
  /** Create a planar mate between two assembly refs. */
  matePlanar: (a: AssemblyRef, b: AssemblyRef, offset?: number) => AssemblyMate;
  /** Create a named assembly output. */
  assemblyOutput: (name: string, refs: AssemblyRef[]) => AssemblyOutput;
  /** Create a mate connector from a selector. */
  mateConnector: (
    id: ID,
    origin: Selector,
    opts?: { normal?: AxisDirection; xAxis?: AxisDirection }
  ) => MateConnector;
  /** Create a datum plane. */
  datumPlane: (
    id: ID,
    normal: DatumPlane["normal"],
    origin?: DatumPlane["origin"],
    deps?: ID[],
    opts?: { xAxis?: DatumPlane["xAxis"] }
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
      plane?: PlaneRef;
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
  /** Generate a 2D grid of sketch entities or sketch profiles. */
  sketchArray: <T extends SketchEntity | SketchProfile>(
    layout: SketchArrayLayout,
    make: (item: SketchArrayItem) => T | T[]
  ) => T[];
  /** Generate a 2D grid of features (constant Z from origin). */
  featureArray: <T extends IntentFeature>(
    layout: FeatureArrayLayout,
    make: (item: FeatureArrayItem) => T | T[]
  ) => T[];
  /** Generate a circular array of sketch entities or sketch profiles. */
  sketchCircularArray: <T extends SketchEntity | SketchProfile>(
    layout: CircularArrayLayout2D,
    make: (item: CircularArrayItem2D) => T | T[]
  ) => T[];
  /** Generate a circular array of features (constant Z from center). */
  featureCircularArray: <T extends IntentFeature>(
    layout: CircularArrayLayout3D,
    make: (item: CircularArrayItem3D) => T | T[]
  ) => T[];
  /** Generate a radial array (angle + radius grid) of sketch entities or sketch profiles. */
  sketchRadialArray: <T extends SketchEntity | SketchProfile>(
    layout: RadialArrayLayout2D,
    make: (item: RadialArrayItem2D) => T | T[]
  ) => T[];
  /** Generate a radial array (angle + radius grid) of features (constant Z from center). */
  featureRadialArray: <T extends IntentFeature>(
    layout: RadialArrayLayout3D,
    make: (item: RadialArrayItem3D) => T | T[]
  ) => T[];
  /** Generate an array along a spline/polyline for sketch entities or profiles. */
  sketchArrayAlongSpline: <T extends SketchEntity | SketchProfile>(
    layout: SplineArrayLayout2D,
    make: (item: SplineArrayItem2D) => T | T[]
  ) => T[];
  /** Generate an array along a spline/polyline for features. */
  featureArrayAlongSpline: <T extends IntentFeature>(
    layout: SplineArrayLayout3D,
    make: (item: SplineArrayItem3D) => T | T[]
  ) => T[];
  /** Extrude a profile into a solid or cut. */
  extrude: (
    id: ID,
    profile: ProfileRef,
    depth: Extrude["depth"],
    result?: string,
    deps?: ID[],
    opts?: { axis?: ExtrudeAxis }
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
  /** Loft between two profiles (solid for closed profiles, surface for open). */
  loft: (
    id: ID,
    profiles: ProfileRef[],
    result?: string,
    deps?: ID[]
  ) => Loft;
  /** Create a straight pipe along an axis. */
  pipe: (
    id: ID,
    axis: AxisDirection,
    length: Scalar,
    outerDiameter: Scalar,
    innerDiameter?: Scalar,
    result?: string,
    opts?: { origin?: Point3D; deps?: ID[] }
  ) => Pipe;
  /** Create a hole feature on a face with axis and depth. */
  hole: (
    id: ID,
    onFace: Selector,
    axis: Hole["axis"],
    diameter: number,
    depth: Hole["depth"],
    opts?: { pattern?: PatternRef; position?: Point2D; deps?: ID[] }
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
    center?: Point3D
  ) => Profile;
  /** Create a circle profile. */
  profileCircle: (radius: Scalar, center?: Point3D) => Profile;
  /** Create a regular polygon profile. */
  profilePoly: (
    sides: Scalar,
    radius: Scalar,
    center?: Point3D,
    rotation?: Scalar
  ) => Profile;
  /** Create a profile from ordered sketch entity ids. */
  profileSketchLoop: (
    loop: ID[],
    opts?: { holes?: ID[][]; open?: boolean }
  ) => Profile;
  /** Create a sketch + profileRef bundle for ordered sketch entity ids. */
  sketchProfileLoop: (
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
  ) => SketchProfileBundle;
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
  /** Create a surface geometry reference for tolerancing. */
  refSurface: (selector: Selector) => RefSurface;
  /** Create a frame geometry reference for tolerancing. */
  refFrame: (selector: Selector) => RefFrame;
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
  /** Create an axis from a 3D direction vector. */
  axisVector: (direction: Point3D) => AxisSpec;
  /** Reference a datum axis for an axis spec. */
  axisDatum: (ref: ID) => AxisSpec;
  /** Use the sketch profile normal for extrude axis. */
  axisSketchNormal: () => ExtrudeAxis;
  /** Reference a datum plane for sketch placement. */
  planeDatum: (ref: ID) => PlaneRef;
  /** Create a polyline path. */
  pathPolyline: (points: Point3D[], opts?: { closed?: boolean }) => Path3D;
  /** Create a spline path from 3D points. */
  pathSpline: (
    points: Point3D[],
    opts?: { closed?: boolean; degree?: Scalar }
  ) => Path3D;
  /** Create a path from explicit segments. */
  pathSegments: (segments: PathSegment[]) => Path3D;
  /** Create a line segment for a path. */
  pathLine: (start: Point3D, end: Point3D) => PathSegment;
  /** Create an arc segment for a path. */
  pathArc: (
    start: Point3D,
    end: Point3D,
    center: Point3D,
    direction?: "cw" | "ccw"
  ) => PathSegment;
  /** Create a surface profile constraint. */
  surfaceProfileConstraint: (
    id: ID,
    target: RefSurface,
    tolerance: Scalar,
    opts?: {
      referenceFrame?: RefFrame;
      capabilities?: ID[];
      requirement?: ID;
    }
  ) => SurfaceProfileConstraint;
  /** Sweep a hollow circular profile along a 3D path. */
  pipeSweep: (
    id: ID,
    path: Path3D,
    outerDiameter: Scalar,
    innerDiameter?: Scalar,
    result?: string,
    opts?: { deps?: ID[] }
  ) => PipeSweep;
  /** Sweep a hollow hexagonal profile along a 3D path (across-flats dimensions). */
  hexTubeSweep: (
    id: ID,
    path: Path3D,
    outerAcrossFlats: Scalar,
    innerAcrossFlats?: Scalar,
    result?: string,
    opts?: { deps?: ID[] }
  ) => HexTubeSweep;
};

export const dsl: DslHelpers = {
  context,
  document,
  part,
  withTags,
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
  mateConnector,
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
  sketchArray,
  featureArray,
  sketchCircularArray,
  featureCircularArray,
  sketchRadialArray,
  featureRadialArray,
  sketchArrayAlongSpline,
  featureArrayAlongSpline,
  extrude,
  revolve,
  loft,
  pipe,
  pipeSweep,
  hexTubeSweep,
  hole,
  fillet,
  chamfer,
  booleanOp,
  patternLinear,
  patternCircular,
  profileRect,
  profileCircle,
  profilePoly,
  profileSketchLoop,
  sketchProfileLoop,
  profileRef,
  selectorFace,
  selectorEdge,
  selectorSolid,
  selectorNamed,
  refSurface,
  refFrame,
  predNormal,
  predPlanar,
  predCreatedBy,
  predRole,
  rankMaxArea,
  rankMinZ,
  rankMaxZ,
  rankClosestTo,
  axisVector,
  axisDatum,
  axisSketchNormal,
  planeDatum,
  pathPolyline,
  pathSpline,
  pathSegments,
  pathLine,
  pathArc,
  surfaceProfileConstraint,
};

export type {
  ArrayOrder,
  ArrayDirection,
  CircularArrayItem2D,
  CircularArrayItem3D,
  CircularArrayLayout2D,
  CircularArrayLayout3D,
  FeatureArrayItem,
  FeatureArrayLayout,
  RadialArrayItem2D,
  RadialArrayItem3D,
  RadialArrayLayout2D,
  RadialArrayLayout3D,
  SketchArrayItem,
  SketchArrayLayout,
  SplineArrayItem2D,
  SplineArrayItem3D,
  SplineArrayLayout2D,
  SplineArrayLayout3D,
} from "./dsl/generators.js";

export {
  context,
  document,
  part,
  withTags,
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
  mateConnector,
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
  sketchArray,
  featureArray,
  sketchCircularArray,
  featureCircularArray,
  sketchRadialArray,
  featureRadialArray,
  sketchArrayAlongSpline,
  featureArrayAlongSpline,
  extrude,
  revolve,
  loft,
  pipe,
  pipeSweep,
  hexTubeSweep,
  hole,
  fillet,
  chamfer,
  booleanOp,
  patternLinear,
  patternCircular,
  profileRect,
  profileCircle,
  profilePoly,
  profileSketchLoop,
  sketchProfileLoop,
  profileRef,
  selectorFace,
  selectorEdge,
  selectorSolid,
  selectorNamed,
  refSurface,
  refFrame,
  predNormal,
  predPlanar,
  predCreatedBy,
  predRole,
  rankMaxArea,
  rankMinZ,
  rankMaxZ,
  rankClosestTo,
  axisVector,
  axisDatum,
  axisSketchNormal,
  planeDatum,
  pathPolyline,
  pathSpline,
  pathSegments,
  pathLine,
  pathArc,
  surfaceProfileConstraint,
};
