export type ID = string;

export type LengthUnit = "mm" | "cm" | "m" | "in";
export type AngleUnit = "rad" | "deg";
export type Unit = LengthUnit | AngleUnit;
export type Units = LengthUnit;

export const TF_IR_SCHEMA = "trueform.ir.v1";
export type IrSchema = typeof TF_IR_SCHEMA;

export const TF_IR_VERSION = 1 as const;
export type IrVersion = typeof TF_IR_VERSION;

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
export type ExtrudeMode = "solid" | "surface";
export type ThickenDirection = "normal" | "reverse";
export type ThreadHandedness = "right" | "left";

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
  schema: IrSchema;
  irVersion: IrVersion;
  parts: IntentPart[];
  assemblies?: IntentAssembly[];
  capabilities?: Record<string, unknown>;
  constraints?: FTIConstraint[];
  assertions?: IntentAssertion[];
  context: BuildContext;
};

export type IntentPart = {
  id: ID;
  features: IntentFeature[];
  params?: ParamDef[];
  connectors?: MateConnector[];
  datums?: FTIDatum[];
  constraints?: FTIConstraint[];
  cosmeticThreads?: CosmeticThread[];
  assertions?: IntentAssertion[];
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
  | { kind: "mate.planar"; a: AssemblyRef; b: AssemblyRef; offset?: number }
  | { kind: "mate.distance"; a: AssemblyRef; b: AssemblyRef; distance?: number }
  | { kind: "mate.angle"; a: AssemblyRef; b: AssemblyRef; angle?: number }
  | { kind: "mate.parallel"; a: AssemblyRef; b: AssemblyRef }
  | { kind: "mate.perpendicular"; a: AssemblyRef; b: AssemblyRef }
  | { kind: "mate.insert"; a: AssemblyRef; b: AssemblyRef; offset?: number }
  | { kind: "mate.slider"; a: AssemblyRef; b: AssemblyRef }
  | { kind: "mate.hinge"; a: AssemblyRef; b: AssemblyRef; offset?: number };

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
  | Plane
  | Surface
  | Revolve
  | Loft
  | Sweep
  | Shell
  | Pipe
  | PipeSweep
  | HexTubeSweep
  | Mirror
  | Draft
  | Thicken
  | Thread
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

export type SweepOrientation = "frenet" | "fixed";

export type Extrude = FeatureBase & {
  kind: "feature.extrude";
  profile: ProfileRef;
  depth: Scalar | "throughAll";
  result: string;
  axis?: ExtrudeAxis;
  mode?: ExtrudeMode;
};

export type Plane = FeatureBase & {
  kind: "feature.plane";
  width: Scalar;
  height: Scalar;
  plane?: PlaneRef;
  origin?: Point3D;
  result: string;
};

export type Surface = FeatureBase & {
  kind: "feature.surface";
  profile: ProfileRef;
  result: string;
};

export type Revolve = FeatureBase & {
  kind: "feature.revolve";
  profile: ProfileRef;
  axis: AxisDirection;
  angle?: Scalar | "full";
  origin?: [number, number, number];
  result: string;
  mode?: ExtrudeMode;
};

export type Loft = FeatureBase & {
  kind: "feature.loft";
  profiles: ProfileRef[];
  result: string;
  mode?: ExtrudeMode;
};

export type Sweep = FeatureBase & {
  kind: "feature.sweep";
  profile: ProfileRef;
  path: Path3D;
  result: string;
  mode?: ExtrudeMode;
  frame?: PlaneRef;
  orientation?: SweepOrientation;
};

export type Shell = FeatureBase & {
  kind: "feature.shell";
  source: Selector;
  thickness: Scalar;
  direction?: "inside" | "outside";
  openFaces?: Selector[];
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
  mode?: ExtrudeMode;
};

export type HexTubeSweep = FeatureBase & {
  kind: "feature.hexTubeSweep";
  path: Path3D;
  outerAcrossFlats: Scalar;
  innerAcrossFlats?: Scalar;
  result: string;
  mode?: ExtrudeMode;
};

export type Mirror = FeatureBase & {
  kind: "feature.mirror";
  source: Selector;
  plane: PlaneRef;
  result: string;
};

export type Draft = FeatureBase & {
  kind: "feature.draft";
  source: Selector;
  faces: Selector;
  neutralPlane: PlaneRef;
  pullDirection: AxisSpec;
  angle: Scalar;
  result: string;
};

export type Thicken = FeatureBase & {
  kind: "feature.thicken";
  surface: Selector;
  thickness: Scalar;
  direction?: ThickenDirection;
  result: string;
};

export type Thread = FeatureBase & {
  kind: "feature.thread";
  axis: AxisSpec;
  origin?: Point3D;
  length: Scalar;
  majorDiameter: Scalar;
  minorDiameter?: Scalar;
  pitch: Scalar;
  handedness?: ThreadHandedness;
  segmentsPerTurn?: Scalar;
  profileAngle?: Scalar;
  crestFlat?: Scalar;
  rootFlat?: Scalar;
  result: string;
};

export type CosmeticThread = {
  id: ID;
  kind: "thread.cosmetic";
  target: GeometryRef;
  designation?: string;
  standard?: string;
  series?: string;
  class?: string;
  handedness?: ThreadHandedness;
  internal?: boolean;
  majorDiameter?: Scalar;
  minorDiameter?: Scalar;
  pitch?: Scalar;
  length?: Scalar;
  depth?: Scalar;
  notes?: string[];
  capabilities?: ID[];
  requirement?: ID;
};

export type HoleCounterbore = {
  diameter: Scalar;
  depth: Scalar;
};

export type HoleCountersink = {
  diameter: Scalar;
  angle: Scalar;
};

export type Hole = FeatureBase & {
  kind: "feature.hole";
  onFace: Selector;
  axis: AxisDirection;
  diameter: Scalar;
  depth: Scalar | "throughAll";
  pattern?: PatternRef;
  position?: Point2D;
  counterbore?: HoleCounterbore;
  countersink?: HoleCountersink;
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
  source?: Selector;
  result?: string;
};

export type PatternCircular = FeatureBase & {
  kind: "pattern.circular";
  origin: Selector;
  axis: AxisDirection;
  count: Scalar;
  source?: Selector;
  result?: string;
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

export type GeometryRef = RefSurface | RefFrame | RefEdge | RefAxis | RefPoint;

export type RefSurface = {
  kind: "ref.surface";
  selector: Selector;
};

export type RefFrame = {
  kind: "ref.frame";
  selector: Selector;
};

export type RefEdge = {
  kind: "ref.edge";
  selector: Selector;
};

export type RefAxis = {
  kind: "ref.axis";
  selector: Selector;
};

export type RefPoint = {
  kind: "ref.point";
  selector: Selector;
};

export type DatumModifier = "MMB" | "LMB" | "RMB";

export type ToleranceModifier =
  | "MMC"
  | "LMC"
  | "RFS"
  | "PROJECTED"
  | "FREE_STATE"
  | "TANGENT_PLANE"
  | "STATISTICAL";

export type DatumRef = {
  kind: "datum.ref";
  datum: ID;
  modifiers?: DatumModifier[];
};

export type FTIDatum = {
  id: ID;
  kind: "datum.feature";
  label: string;
  target: GeometryRef;
  modifiers?: DatumModifier[];
  capabilities?: ID[];
  requirement?: ID;
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

export type FlatnessConstraint = {
  id: ID;
  kind: "constraint.flatness";
  target: RefSurface;
  tolerance: Scalar;
  capabilities?: ID[];
  requirement?: ID;
};

export type ParallelismConstraint = {
  id: ID;
  kind: "constraint.parallelism";
  target: RefSurface;
  tolerance: Scalar;
  datum: DatumRef[];
  modifiers?: ToleranceModifier[];
  capabilities?: ID[];
  requirement?: ID;
};

export type PerpendicularityConstraint = {
  id: ID;
  kind: "constraint.perpendicularity";
  target: RefSurface;
  tolerance: Scalar;
  datum: DatumRef[];
  modifiers?: ToleranceModifier[];
  capabilities?: ID[];
  requirement?: ID;
};

export type PositionConstraint = {
  id: ID;
  kind: "constraint.position";
  target: GeometryRef;
  tolerance: Scalar;
  datum: DatumRef[];
  modifiers?: ToleranceModifier[];
  capabilities?: ID[];
  requirement?: ID;
  zone?: "diameter" | "cartesian";
};

export type SizeConstraint = {
  id: ID;
  kind: "constraint.size";
  target: GeometryRef;
  nominal?: Scalar;
  tolerance?: Scalar;
  min?: Scalar;
  max?: Scalar;
  modifiers?: ToleranceModifier[];
  capabilities?: ID[];
  requirement?: ID;
};

export type DimensionDistance = {
  id: ID;
  kind: "dimension.distance";
  from: GeometryRef;
  to: GeometryRef;
  nominal?: Scalar;
  tolerance?: Scalar;
  plus?: Scalar;
  minus?: Scalar;
  capabilities?: ID[];
  requirement?: ID;
};

export type DimensionAngle = {
  id: ID;
  kind: "dimension.angle";
  from: GeometryRef;
  to: GeometryRef;
  nominal?: Scalar;
  tolerance?: Scalar;
  plus?: Scalar;
  minus?: Scalar;
  capabilities?: ID[];
  requirement?: ID;
};

export type FTIConstraint =
  | SurfaceProfileConstraint
  | FlatnessConstraint
  | ParallelismConstraint
  | PerpendicularityConstraint
  | PositionConstraint
  | SizeConstraint
  | DimensionDistance
  | DimensionAngle;

export type AssertionBrepValid = {
  id: ID;
  kind: "assert.brepValid";
  target?: Selector;
};

export type AssertionMinEdgeLength = {
  id: ID;
  kind: "assert.minEdgeLength";
  min: Scalar;
  target?: Selector;
};

export type IntentAssertion = AssertionBrepValid | AssertionMinEdgeLength;

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
