import type { PathHelix, PathSpiral, Point3D, Scalar } from "./ir.js";
import { cross, dot, isFiniteVec, normalizeVector } from "./occt/vector_math.js";

export function sampleHelixPathPoints(path: PathHelix): [number, number, number][] {
  const origin = point3Numbers(path.origin);
  const axis = normalizeNonZeroVector(point3Numbers(path.axis), "path helix axis");
  const radius = finiteScalar(path.radius, "path helix radius");
  const pitch = finiteScalar(path.pitch, "path helix pitch");
  const turns =
    path.turns !== undefined
      ? finiteScalar(path.turns, "path helix turns")
      : finiteScalar(path.length, "path helix length") / pitch;
  const startAngle = path.startAngle === undefined ? 0 : finiteScalar(path.startAngle, "path helix startAngle");
  const segmentsPerTurn =
    path.segmentsPerTurn === undefined
      ? 32
      : Math.max(3, Math.round(finiteScalar(path.segmentsPerTurn, "path helix segmentsPerTurn")));
  const handedness = path.handedness ?? "right";
  const basis = orthonormalBasis(axis);
  const totalAngle = Math.PI * 2 * turns * (handedness === "left" ? -1 : 1);
  const axialLength = pitch * turns;
  const segmentCount = Math.max(8, Math.ceil(Math.abs(turns) * segmentsPerTurn));
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segmentCount; i += 1) {
    const t = segmentCount === 0 ? 0 : i / segmentCount;
    const angle = startAngle + totalAngle * t;
    const radial = addVec(
      scaleVec(basis.xDir, radius * Math.cos(angle)),
      scaleVec(basis.yDir, radius * Math.sin(angle))
    );
    const axial = scaleVec(axis, axialLength * t);
    points.push(addVec(origin, addVec(radial, axial)));
  }
  return points;
}

export function sampleSpiralPathPoints(path: PathSpiral): [number, number, number][] {
  const origin = point3Numbers(path.origin);
  const normal = normalizeNonZeroVector(point3Numbers(path.normal ?? [0, 0, 1]), "path spiral normal");
  const xDirHint = path.xDir === undefined ? undefined : point3Numbers(path.xDir);
  const basis = orthonormalBasis(normal, xDirHint);
  const startRadius = finiteScalar(path.startRadius, "path spiral startRadius");
  const endRadius = finiteScalar(path.endRadius, "path spiral endRadius");
  const turns = finiteScalar(path.turns, "path spiral turns");
  const startAngle =
    path.startAngle === undefined ? 0 : finiteScalar(path.startAngle, "path spiral startAngle");
  const segmentsPerTurn =
    path.segmentsPerTurn === undefined
      ? 48
      : Math.max(3, Math.round(finiteScalar(path.segmentsPerTurn, "path spiral segmentsPerTurn")));
  const handedness = path.handedness ?? "right";
  const totalAngle = Math.PI * 2 * turns * (handedness === "left" ? -1 : 1);
  const segmentCount = Math.max(8, Math.ceil(Math.abs(turns) * segmentsPerTurn));
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segmentCount; i += 1) {
    const t = segmentCount === 0 ? 0 : i / segmentCount;
    const angle = startAngle + totalAngle * t;
    const radius = startRadius + (endRadius - startRadius) * t;
    const radial = addVec(
      scaleVec(basis.xDir, radius * Math.cos(angle)),
      scaleVec(basis.yDir, radius * Math.sin(angle))
    );
    points.push(addVec(origin, radial));
  }
  return points;
}

function orthonormalBasis(
  normal: [number, number, number],
  xDirHint?: [number, number, number]
): { xDir: [number, number, number]; yDir: [number, number, number] } {
  const normalUnit = normalizeNonZeroVector(normal, "path basis normal");
  let xDir = xDirHint ? normalizeProjectedVector(xDirHint, normalUnit) : fallbackPerpendicular(normalUnit);
  if (!isFiniteVec(xDir)) {
    xDir = fallbackPerpendicular(normalUnit);
  }
  const yDir = normalizeNonZeroVector(cross(normalUnit, xDir), "path basis yDir");
  return { xDir, yDir };
}

function normalizeProjectedVector(
  vector: [number, number, number],
  normal: [number, number, number]
): [number, number, number] {
  const scale = dot(vector, normal);
  return normalizeNonZeroVector(subVec(vector, scaleVec(normal, scale)), "path basis xDir");
}

function fallbackPerpendicular(normal: [number, number, number]): [number, number, number] {
  const seed =
    Math.abs(normal[0]) < 0.9 ? ([1, 0, 0] as [number, number, number]) : ([0, 1, 0] as [number, number, number]);
  return normalizeNonZeroVector(cross(normal, seed), "path basis perpendicular");
}

function point3Numbers(point: Point3D): [number, number, number] {
  return [
    finiteScalar(point[0], "path point x"),
    finiteScalar(point[1], "path point y"),
    finiteScalar(point[2], "path point z"),
  ];
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`OCCT backend: ${label} must be finite`);
  }
  return value;
}

function finiteScalar(value: Scalar | undefined, label: string): number {
  return finiteNumber(value, label);
}

function normalizeNonZeroVector(
  vector: [number, number, number],
  label: string
): [number, number, number] {
  const normalized = normalizeVector(vector);
  if (!isFiniteVec(normalized)) {
    throw new Error(`OCCT backend: ${label} must be non-zero`);
  }
  return normalized;
}

function addVec(
  left: [number, number, number],
  right: [number, number, number]
): [number, number, number] {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subVec(
  left: [number, number, number],
  right: [number, number, number]
): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scaleVec(
  vector: [number, number, number],
  scale: number
): [number, number, number] {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}
