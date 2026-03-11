import type { KernelResult } from "../backend.js";
import type { Thread } from "../ir.js";
import type { PlaneBasis } from "./plane_basis.js";
import { dot, expectNumber, isFiniteVec, normalizeVector } from "./vector_math.js";

type ThreadSweepOptions = {
  makeSolid?: boolean;
  frenet?: boolean;
  allowFallback?: boolean;
};

type ThreadBuildDeps = {
  resolveAxisSpec: (
    axis: Thread["axis"],
    upstream: KernelResult,
    label: string
  ) => [number, number, number];
  subVec: (a: [number, number, number], b: [number, number, number]) => [number, number, number];
  scaleVec: (v: [number, number, number], s: number) => [number, number, number];
  addVec: (a: [number, number, number], b: [number, number, number]) => [number, number, number];
  planeBasisFromNormal: (
    origin: [number, number, number],
    normal: [number, number, number]
  ) => PlaneBasis;
  makePolygonWire: (points: [number, number, number][]) => any;
  makeSplineEdge3D: (path: {
    kind: "path.spline";
    points: [number, number, number][];
  }) => { edge: any };
  makeWireFromEdges: (edges: any[]) => any;
  makeSweepSolid: (spine: any, profile: any, opts?: ThreadSweepOptions) => any;
  normalizeSolid: (shape: any) => any;
  shapeHasSolid: (shape: any) => boolean;
  makeSolidFromShells: (shape: any) => any | null;
  readShape: (shape: any) => any;
  makeCylinder: (
    radius: number,
    height: number,
    axis: [number, number, number],
    center: [number, number, number]
  ) => any;
  makeBoolean: (op: "cut", left: any, right: any) => any;
  unifySameDomain: (shape: any) => any;
  isValidShape: (shape: any) => boolean;
  solidVolume: (shape: any) => number;
  reverseShape: (shape: any) => any;
};

export function buildThreadSolid(params: {
  feature: Thread;
  upstream: KernelResult;
  deps: ThreadBuildDeps;
}): { solid: any; ridge: any; blank: any } {
  const { feature, upstream, deps } = params;
  const axisDir = deps.resolveAxisSpec(feature.axis, upstream, "thread axis");
  const axis = normalizeVector(axisDir);
  if (!isFiniteVec(axis)) {
    throw new Error("OCCT backend: thread axis is degenerate");
  }
  const origin = feature.origin ?? [0, 0, 0];
  const originVec: [number, number, number] = [
    expectNumber(origin[0], "thread origin[0]"),
    expectNumber(origin[1], "thread origin[1]"),
    expectNumber(origin[2], "thread origin[2]"),
  ];
  const length = expectNumber(feature.length, "thread length");
  if (length <= 0) {
    throw new Error("OCCT backend: thread length must be positive");
  }
  const pitch = expectNumber(feature.pitch, "thread pitch");
  if (pitch <= 0) {
    throw new Error("OCCT backend: thread pitch must be positive");
  }
  const majorDiameter = expectNumber(feature.majorDiameter, "thread major diameter");
  if (majorDiameter <= 0) {
    throw new Error("OCCT backend: thread major diameter must be positive");
  }
  const defaultMinor = majorDiameter - pitch * 1.22687;
  const minorDiameter =
    feature.minorDiameter === undefined
      ? defaultMinor
      : expectNumber(feature.minorDiameter, "thread minor diameter");
  if (minorDiameter <= 0 || minorDiameter >= majorDiameter) {
    throw new Error("OCCT backend: thread minor diameter must be smaller than major diameter");
  }

  const majorRadius = majorDiameter / 2;
  const minorRadius = minorDiameter / 2;
  const depth = majorRadius - minorRadius;
  const halfDepth = depth / 2;
  const pitchRadius = (majorRadius + minorRadius) / 2;
  const radialCutOverlap = Math.max(depth * 0.005, 5e-5);
  const axialCutOverlap = Math.max(depth * 0.1, pitch * 0.05, 1e-3);
  const cutOriginVec = deps.subVec(originVec, deps.scaleVec(axis, axialCutOverlap));
  const cutLength = length + axialCutOverlap * 2;
  const handedness = feature.handedness ?? "right";
  const direction = handedness === "left" ? -1 : 1;

  const basePlane = deps.planeBasisFromNormal(cutOriginVec, axis);
  const angle =
    feature.profileAngle === undefined
      ? Math.PI / 3
      : expectNumber(feature.profileAngle, "thread profile angle");
  if (!(angle > 0 && angle < Math.PI)) {
    throw new Error("OCCT backend: thread profile angle must be between 0 and PI");
  }

  const sharpHeight = pitch / (2 * Math.tan(angle / 2));
  const truncation = Math.max(0, sharpHeight - depth);
  const crestTrunc = truncation / 3;
  const rootTrunc = (truncation * 2) / 3;
  let crestFlat =
    feature.crestFlat === undefined
      ? 2 * crestTrunc * Math.tan(angle / 2)
      : Math.max(0, expectNumber(feature.crestFlat, "thread crest flat"));
  let rootFlat =
    feature.rootFlat === undefined
      ? 2 * rootTrunc * Math.tan(angle / 2)
      : Math.max(0, expectNumber(feature.rootFlat, "thread root flat"));
  if (feature.crestFlat !== undefined && feature.rootFlat === undefined) {
    const crestHalf = crestFlat / 2;
    rootFlat = Math.max(0, (crestHalf + depth * Math.tan(angle / 2)) * 2);
  } else if (feature.rootFlat !== undefined && feature.crestFlat === undefined) {
    const rootHalf = rootFlat / 2;
    crestFlat = Math.max(0, (rootHalf - depth * Math.tan(angle / 2)) * 2);
  }
  if (crestFlat <= 1e-6 && rootFlat <= 1e-6) {
    const candidate = 2 * depth * Math.tan(angle / 2);
    rootFlat = Math.max(1e-6, Math.min(pitch * 0.9, candidate));
  }

  const turns = cutLength / pitch;
  const angleSpan = direction * Math.PI * 2 * turns;

  const crestHalf = crestFlat / 2;
  const rootHalf = rootFlat / 2;
  const innerCutOverlap = Math.max(depth * 0.03, 1e-4);
  const crestOffset = halfDepth + radialCutOverlap;
  const rootOffset = -(halfDepth + innerCutOverlap);
  let segmentsPerTurn =
    feature.segmentsPerTurn === undefined
      ? 24
      : Math.round(Math.max(8, expectNumber(feature.segmentsPerTurn, "thread segments per turn")));
  const maxSpineSegments = 640;
  const rawSpineSegments = Math.ceil(turns * segmentsPerTurn);
  if (rawSpineSegments > maxSpineSegments) {
    segmentsPerTurn = Math.max(8, Math.floor(maxSpineSegments / Math.max(turns, 1)));
  }
  const segments = Math.max(24, Math.ceil(turns * segmentsPerTurn));
  const startAngleOffset = Math.PI * 0.5;
  const startCos = Math.cos(startAngleOffset);
  const startSin = Math.sin(startAngleOffset);
  let startRadialDir = normalizeVector(
    deps.addVec(
      deps.scaleVec(basePlane.xDir, startCos),
      deps.scaleVec(basePlane.yDir, startSin)
    )
  );
  if (!isFiniteVec(startRadialDir)) {
    startRadialDir = basePlane.xDir;
  }
  const startCenter = deps.addVec(cutOriginVec, deps.scaleVec(startRadialDir, pitchRadius));
  let profileX = normalizeVector(startRadialDir);
  const axisProj = dot(profileX, axis);
  if (Math.abs(axisProj) > 1e-6) {
    profileX = normalizeVector(deps.subVec(profileX, deps.scaleVec(axis, axisProj)));
  }
  if (!isFiniteVec(profileX)) {
    profileX = basePlane.xDir;
  }
  let profileY = axis;
  if (!isFiniteVec(profileY)) {
    profileY = basePlane.yDir;
  }
  const profilePoints: [number, number, number][] = [];
  if (crestHalf > 1e-6) {
    profilePoints.push(
      deps.addVec(
        deps.addVec(startCenter, deps.scaleVec(profileY, -crestHalf)),
        deps.scaleVec(profileX, crestOffset)
      )
    );
    profilePoints.push(
      deps.addVec(
        deps.addVec(startCenter, deps.scaleVec(profileY, crestHalf)),
        deps.scaleVec(profileX, crestOffset)
      )
    );
  } else {
    profilePoints.push(deps.addVec(startCenter, deps.scaleVec(profileX, crestOffset)));
  }
  if (rootHalf > 1e-6) {
    profilePoints.push(
      deps.addVec(
        deps.addVec(startCenter, deps.scaleVec(profileY, rootHalf)),
        deps.scaleVec(profileX, rootOffset)
      )
    );
    profilePoints.push(
      deps.addVec(
        deps.addVec(startCenter, deps.scaleVec(profileY, -rootHalf)),
        deps.scaleVec(profileX, rootOffset)
      )
    );
  } else {
    profilePoints.push(deps.addVec(startCenter, deps.scaleVec(profileX, rootOffset)));
  }
  const profileWire = deps.makePolygonWire(profilePoints);

  const helixPoints: [number, number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const angleStep = startAngleOffset + angleSpan * t;
    const cos = Math.cos(angleStep);
    const sin = Math.sin(angleStep);
    const radialVec = deps.addVec(
      deps.scaleVec(basePlane.xDir, pitchRadius * cos),
      deps.scaleVec(basePlane.yDir, pitchRadius * sin)
    );
    const along = deps.scaleVec(axis, cutLength * t);
    helixPoints.push(deps.addVec(cutOriginVec, deps.addVec(radialVec, along)));
  }
  const helixEdge = deps.makeSplineEdge3D({
    kind: "path.spline",
    points: helixPoints,
  }).edge;
  const spine = deps.makeWireFromEdges([helixEdge]);
  let ridge = deps.makeSweepSolid(spine, profileWire, {
    makeSolid: true,
    frenet: true,
    allowFallback: false,
  });
  ridge = deps.normalizeSolid(ridge);
  if (!deps.shapeHasSolid(ridge)) {
    const stitched = deps.makeSolidFromShells(ridge);
    if (stitched) {
      ridge = deps.normalizeSolid(stitched);
    }
  }
  const blank = deps.readShape(deps.makeCylinder(majorRadius, length, axis, originVec));
  const cut = deps.makeBoolean("cut", blank, ridge);
  let solid = deps.readShape(cut);
  solid = deps.unifySameDomain(solid);
  solid = deps.normalizeSolid(solid);
  if (!deps.shapeHasSolid(solid) || !deps.isValidShape(solid)) {
    throw new Error("OCCT backend: thread cut produced an invalid solid");
  }
  const solidVolume = deps.solidVolume(solid);
  if (Number.isFinite(solidVolume) && solidVolume < 0) {
    solid = deps.reverseShape(solid);
  }

  return { solid, ridge, blank };
}
