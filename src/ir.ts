export type ID = string;

export type Units = "mm" | "cm" | "m" | "in";

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

export type DocumentIR = {
  id: ID;
  parts: PartIR[];
  context: BuildContext;
};

export type PartIR = {
  id: ID;
  features: FeatureIR[];
};

export type FeatureIR =
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
  normal: "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
  origin?: [number, number, number];
};

export type DatumAxis = FeatureBase & {
  kind: "datum.axis";
  direction: "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
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
  profiles: SketchProfile[];
};

export type SketchProfile = {
  name: string;
  profile: Profile;
};

export type Extrude = FeatureBase & {
  kind: "feature.extrude";
  profile: ProfileRef;
  depth: number | "throughAll";
  result: string;
};

export type Revolve = FeatureBase & {
  kind: "feature.revolve";
  profile: ProfileRef;
  axis: "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
  angle?: number | "full";
  origin?: [number, number, number];
  result: string;
};

export type Hole = FeatureBase & {
  kind: "feature.hole";
  onFace: Selector;
  axis: "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
  diameter: number;
  depth: number | "throughAll";
  pattern?: PatternRef;
};

export type Fillet = FeatureBase & {
  kind: "feature.fillet";
  edges: Selector;
  radius: number;
};

export type Chamfer = FeatureBase & {
  kind: "feature.chamfer";
  edges: Selector;
  distance: number;
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
  spacing: [number, number];
  count: [number, number];
};

export type PatternCircular = FeatureBase & {
  kind: "pattern.circular";
  origin: Selector;
  axis: "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
  count: number;
};

export type PatternRef =
  | { kind: "pattern.linear"; ref: ID }
  | { kind: "pattern.circular"; ref: ID };

export type Profile =
  | {
      kind: "profile.rectangle";
      width: number;
      height: number;
      center?: [number, number, number];
    }
  | {
      kind: "profile.circle";
      radius: number;
      center?: [number, number, number];
    };

export type ProfileRef =
  | Profile
  | {
      kind: "profile.ref";
      name: string;
    };

export type Selector =
  | FaceQuery
  | EdgeQuery
  | SolidQuery
  | NamedOutput;

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
  | { kind: "pred.normal"; value: "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z" }
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
