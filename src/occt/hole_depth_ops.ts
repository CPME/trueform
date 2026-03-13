import type { Hole, HoleEndCondition } from "../ir.js";
import { dot, expectNumber, isFiniteVec, normalizeVector } from "./vector_math.js";

export type HoleDepthDeps = {
  occt: any;
  shapeBounds: (shape: any) => { min: [number, number, number]; max: [number, number, number] };
  axisBounds: (
    axis: [number, number, number],
    bounds: { min: [number, number, number]; max: [number, number, number] }
  ) => { min: number; max: number } | null;
  throughAllDepth: (
    shape: any,
    axisDir: [number, number, number],
    origin: [number, number, number]
  ) => number;
  readShape: (shape: any) => any;
  makeCylinder: (
    radius: number,
    height: number,
    axisDir: [number, number, number],
    origin: [number, number, number]
  ) => any;
  makeBoolean: (op: "intersect", left: any, right: any) => any;
};

export function resolveHoleEndCondition(feature: Hole): HoleEndCondition {
  if (feature.wizard?.endCondition) {
    return feature.wizard.endCondition;
  }
  return feature.depth === "throughAll" ? "throughAll" : "blind";
}

export function resolveHoleDepth(
  deps: HoleDepthDeps,
  feature: Hole,
  owner: any,
  axisDir: [number, number, number],
  origin: [number, number, number],
  holeRadius: number,
  endCondition: HoleEndCondition
): number {
  if (endCondition === "blind") {
    return expectNumber(feature.depth, "feature.depth");
  }
  if (endCondition === "throughAll" || endCondition === "upToLast") {
    return depthToBodyLimit(deps, owner, axisDir, origin, holeRadius, "last");
  }
  return depthToBodyLimit(deps, owner, axisDir, origin, holeRadius, "next");
}

function depthToBodyLimit(
  deps: HoleDepthDeps,
  shape: any,
  axisDir: [number, number, number],
  origin: [number, number, number],
  holeRadius: number,
  mode: "next" | "last"
): number {
  const probeDepth = depthToBodyLimitByProbe(deps, shape, axisDir, origin, holeRadius, mode);
  if (probeDepth !== null) return probeDepth;
  const boundsDepth = depthToBodyLimitByBounds(deps, shape, axisDir, origin);
  if (boundsDepth !== null) return boundsDepth;
  return deps.throughAllDepth(shape, axisDir, origin);
}

function depthToBodyLimitByProbe(
  deps: HoleDepthDeps,
  shape: any,
  axisDir: [number, number, number],
  origin: [number, number, number],
  holeRadius: number,
  mode: "next" | "last"
): number | null {
  const axis = normalizeVector(axisDir);
  if (!isFiniteVec(axis)) return null;
  const maxDepth = depthToBodyLimitByBounds(deps, shape, axis, origin);
  if (!(maxDepth !== null && maxDepth > 0)) return null;

  const probeRadius = Math.max(0.05, Math.min(0.5, holeRadius * 0.25));
  const probeHeight = maxDepth + holeDepthMargin(maxDepth);
  if (!(probeHeight > 0)) return null;

  let intersected: any;
  try {
    const probe = deps.readShape(deps.makeCylinder(probeRadius, probeHeight, axis, origin));
    intersected = deps.readShape(deps.makeBoolean("intersect", shape, probe));
  } catch {
    return null;
  }

  const ranges = collectSolidProjectionRanges(deps, intersected, axis);
  if (ranges.length === 0) return null;
  const start = dot(origin, axis);
  const eps = 1e-6;
  const distances: number[] = [];
  for (const range of ranges) {
    const entry = Math.max(range.min, start);
    const exit = range.max;
    const depth = exit - entry;
    if (exit > start + eps && depth > eps) {
      distances.push(exit - start);
    }
  }
  if (distances.length === 0) return null;
  const base = mode === "next" ? Math.min(...distances) : Math.max(...distances);
  if (!(base > 0)) return null;
  return base + holeDepthMargin(base);
}

function depthToBodyLimitByBounds(
  deps: HoleDepthDeps,
  shape: any,
  axisDir: [number, number, number],
  origin: [number, number, number]
): number | null {
  const axis = normalizeVector(axisDir);
  if (!isFiniteVec(axis)) return null;
  const extents = deps.axisBounds(axis, deps.shapeBounds(shape));
  if (!extents) return null;
  const start = dot(origin, axis);
  const span = extents.max - extents.min;
  if (!(span > 0)) return null;
  const next = extents.max - start;
  if (!(next > 1e-6)) return null;
  return next + holeDepthMargin(next);
}

function collectSolidProjectionRanges(
  deps: HoleDepthDeps,
  shape: any,
  axis: [number, number, number]
): Array<{ min: number; max: number }> {
  const explorer = new deps.occt.TopExp_Explorer_1();
  explorer.Init(
    shape,
    deps.occt.TopAbs_ShapeEnum.TopAbs_SOLID,
    deps.occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  const ranges: Array<{ min: number; max: number }> = [];
  for (; explorer.More(); explorer.Next()) {
    const solid = explorer.Current();
    const bounds = deps.axisBounds(axis, deps.shapeBounds(solid));
    if (bounds) {
      ranges.push({ min: bounds.min, max: bounds.max });
    }
  }
  ranges.sort((left, right) => left.min - right.min);
  return ranges;
}

function holeDepthMargin(depth: number): number {
  return Math.max(0.05, depth * 0.02);
}
