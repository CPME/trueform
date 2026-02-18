import type {
  AssertionBrepValid,
  AssertionMinEdgeLength,
  CosmeticThread,
  DatumModifier,
  DatumRef,
  DimensionAngle,
  DimensionDistance,
  FTIDatum,
  FlatnessConstraint,
  GeometryRef,
  ID,
  ParallelismConstraint,
  PerpendicularityConstraint,
  PositionConstraint,
  RefAxis,
  RefEdge,
  RefFrame,
  RefPoint,
  RefSurface,
  Scalar,
  Selector,
  SizeConstraint,
  SurfaceProfileConstraint,
  ThreadHandedness,
  ToleranceModifier,
} from "../ir.js";
import { compact } from "./utils.js";

export const refSurface = (selector: Selector): RefSurface => ({
  kind: "ref.surface",
  selector,
});

export const refFrame = (selector: Selector): RefFrame => ({
  kind: "ref.frame",
  selector,
});

export const refEdge = (selector: Selector): RefEdge => ({
  kind: "ref.edge",
  selector,
});

export const refAxis = (selector: Selector): RefAxis => ({
  kind: "ref.axis",
  selector,
});

export const refPoint = (selector: Selector): RefPoint => ({
  kind: "ref.point",
  selector,
});

export const datumFeature = (
  id: ID,
  label: string,
  target: RefSurface | RefEdge | RefAxis | RefPoint | RefFrame,
  opts?: {
    modifiers?: DatumModifier[];
    capabilities?: ID[];
    requirement?: ID;
  }
): FTIDatum =>
  compact({
    id,
    kind: "datum.feature",
    label,
    target,
    modifiers: opts?.modifiers,
    capabilities: opts?.capabilities,
    requirement: opts?.requirement,
  });

export const datumRef = (datum: ID, modifiers?: DatumModifier[]): DatumRef => ({
  kind: "datum.ref",
  datum,
  modifiers,
});

export const surfaceProfileConstraint = (
  id: ID,
  target: RefSurface,
  tolerance: Scalar,
  opts?: {
    referenceFrame?: RefFrame;
    capabilities?: ID[];
    requirement?: ID;
  }
): SurfaceProfileConstraint =>
  compact({
    id,
    kind: "constraint.surfaceProfile",
    target,
    tolerance,
    referenceFrame: opts?.referenceFrame,
    capabilities: opts?.capabilities,
    requirement: opts?.requirement,
  });

export const flatnessConstraint = (
  id: ID,
  target: RefSurface,
  tolerance: Scalar,
  opts?: { capabilities?: ID[]; requirement?: ID }
): FlatnessConstraint =>
  compact({
    id,
    kind: "constraint.flatness",
    target,
    tolerance,
    capabilities: opts?.capabilities,
    requirement: opts?.requirement,
  });

export const parallelismConstraint = (
  id: ID,
  target: RefSurface,
  tolerance: Scalar,
  datum: DatumRef[],
  opts?: { modifiers?: ToleranceModifier[]; capabilities?: ID[]; requirement?: ID }
): ParallelismConstraint =>
  compact({
    id,
    kind: "constraint.parallelism",
    target,
    tolerance,
    datum,
    modifiers: opts?.modifiers,
    capabilities: opts?.capabilities,
    requirement: opts?.requirement,
  });

export const perpendicularityConstraint = (
  id: ID,
  target: RefSurface,
  tolerance: Scalar,
  datum: DatumRef[],
  opts?: { modifiers?: ToleranceModifier[]; capabilities?: ID[]; requirement?: ID }
): PerpendicularityConstraint =>
  compact({
    id,
    kind: "constraint.perpendicularity",
    target,
    tolerance,
    datum,
    modifiers: opts?.modifiers,
    capabilities: opts?.capabilities,
    requirement: opts?.requirement,
  });

export const positionConstraint = (
  id: ID,
  target: RefSurface | RefEdge | RefAxis | RefPoint | RefFrame,
  tolerance: Scalar,
  datum: DatumRef[],
  opts?: {
    modifiers?: ToleranceModifier[];
    capabilities?: ID[];
    requirement?: ID;
    zone?: PositionConstraint["zone"];
  }
): PositionConstraint =>
  compact({
    id,
    kind: "constraint.position",
    target,
    tolerance,
    datum,
    modifiers: opts?.modifiers,
    capabilities: opts?.capabilities,
    requirement: opts?.requirement,
    zone: opts?.zone,
  });

export const assertBrepValid = (
  id: ID,
  target?: Selector
): AssertionBrepValid =>
  compact({
    id,
    kind: "assert.brepValid",
    target,
  });

export const assertMinEdgeLength = (
  id: ID,
  min: Scalar,
  target?: Selector
): AssertionMinEdgeLength =>
  compact({
    id,
    kind: "assert.minEdgeLength",
    min,
    target,
  });

export const sizeConstraint = (
  id: ID,
  target: RefSurface | RefEdge | RefAxis | RefPoint | RefFrame,
  opts: {
    nominal?: Scalar;
    tolerance?: Scalar;
    min?: Scalar;
    max?: Scalar;
    modifiers?: ToleranceModifier[];
    capabilities?: ID[];
    requirement?: ID;
  }
): SizeConstraint =>
  compact({
    id,
    kind: "constraint.size",
    target,
    nominal: opts.nominal,
    tolerance: opts.tolerance,
    min: opts.min,
    max: opts.max,
    modifiers: opts.modifiers,
    capabilities: opts.capabilities,
    requirement: opts.requirement,
  });

export const dimensionDistance = (
  id: ID,
  from: GeometryRef,
  to: GeometryRef,
  opts?: {
    nominal?: Scalar;
    tolerance?: Scalar;
    plus?: Scalar;
    minus?: Scalar;
    capabilities?: ID[];
    requirement?: ID;
  }
): DimensionDistance =>
  compact({
    id,
    kind: "dimension.distance",
    from,
    to,
    nominal: opts?.nominal,
    tolerance: opts?.tolerance,
    plus: opts?.plus,
    minus: opts?.minus,
    capabilities: opts?.capabilities,
    requirement: opts?.requirement,
  });

export const dimensionAngle = (
  id: ID,
  from: GeometryRef,
  to: GeometryRef,
  opts?: {
    nominal?: Scalar;
    tolerance?: Scalar;
    plus?: Scalar;
    minus?: Scalar;
    capabilities?: ID[];
    requirement?: ID;
  }
): DimensionAngle =>
  compact({
    id,
    kind: "dimension.angle",
    from,
    to,
    nominal: opts?.nominal,
    tolerance: opts?.tolerance,
    plus: opts?.plus,
    minus: opts?.minus,
    capabilities: opts?.capabilities,
    requirement: opts?.requirement,
  });

export const cosmeticThread = (
  id: ID,
  target: GeometryRef,
  opts?: {
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
  }
): CosmeticThread =>
  compact({
    id,
    kind: "thread.cosmetic",
    target,
    designation: opts?.designation,
    standard: opts?.standard,
    series: opts?.series,
    class: opts?.class,
    handedness: opts?.handedness,
    internal: opts?.internal,
    majorDiameter: opts?.majorDiameter,
    minorDiameter: opts?.minorDiameter,
    pitch: opts?.pitch,
    length: opts?.length,
    depth: opts?.depth,
    notes: opts?.notes,
    capabilities: opts?.capabilities,
    requirement: opts?.requirement,
  });
