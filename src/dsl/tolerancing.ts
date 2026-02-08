import type {
  DatumModifier,
  DatumRef,
  FTIDatum,
  FlatnessConstraint,
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
  ToleranceModifier,
} from "../dsl.js";
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
