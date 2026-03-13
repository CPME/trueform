import type { Path3D, Point3D } from "../ir.js";
import {
  clamp,
  cross,
  dot,
  isFiniteVec,
  normalizeVector,
  rotateAroundAxis,
  vecLength,
} from "./vector_math.js";

type EdgeSegment = {
  edge: any;
  start: [number, number, number];
  end: [number, number, number];
};

export type PathWireBuilderDeps = {
  newOcct: (name: string, ...args: any[]) => any;
  addWireEdge: (builder: any, edge: any) => boolean;
  point3Numbers: (point: Point3D, label: string) => [number, number, number];
  makeLineEdge: (start: [number, number, number], end: [number, number, number]) => any;
  makeArcEdge: (
    start: [number, number, number],
    mid: [number, number, number],
    end: [number, number, number]
  ) => any;
  makeSplineEdge3D: (path: Extract<Path3D, { kind: "path.spline" }>) => {
    edge: any;
    start: [number, number, number];
    end: [number, number, number];
    closed: boolean;
  };
  pointsClose: (a: [number, number, number], b: [number, number, number], tol?: number) => boolean;
};

export function buildPathWire(path: Path3D, deps: PathWireBuilderDeps) {
  const segments: EdgeSegment[] = [];
  if (path.kind === "path.spline") {
    const { edge, start, end } = deps.makeSplineEdge3D(path);
    segments.push({ edge, start, end });
  } else if (path.kind === "path.polyline") {
    const points = path.points;
    for (let i = 0; i < points.length - 1; i += 1) {
      const startPoint = points[i];
      const endPoint = points[i + 1];
      if (!startPoint || !endPoint) continue;
      const start = deps.point3Numbers(startPoint, "path point");
      const end = deps.point3Numbers(endPoint, "path point");
      segments.push({ edge: deps.makeLineEdge(start, end), start, end });
    }
    if (path.closed && points.length > 1) {
      const startPoint = points[points.length - 1];
      const endPoint = points[0];
      if (startPoint && endPoint) {
        const start = deps.point3Numbers(startPoint, "path point");
        const end = deps.point3Numbers(endPoint, "path point");
        segments.push({ edge: deps.makeLineEdge(start, end), start, end });
      }
    }
  } else {
    for (const segment of path.segments) {
      if (segment.kind === "path.line") {
        const start = deps.point3Numbers(segment.start, "path line start");
        const end = deps.point3Numbers(segment.end, "path line end");
        segments.push({ edge: deps.makeLineEdge(start, end), start, end });
        continue;
      }
      if (segment.kind === "path.arc") {
        const start = deps.point3Numbers(segment.start, "path arc start");
        const end = deps.point3Numbers(segment.end, "path arc end");
        const center = deps.point3Numbers(segment.center, "path arc center");
        const mid = arcMidpointFromCenter(start, end, center, segment.direction);
        segments.push({ edge: deps.makeArcEdge(start, mid, end), start, end });
      }
    }
  }

  if (segments.length === 0) {
    throw new Error("OCCT backend: path must have at least one segment");
  }
  for (let i = 0; i < segments.length - 1; i += 1) {
    const current = segments[i];
    const next = segments[i + 1];
    if (!current || !next) continue;
    if (!deps.pointsClose(current.end, next.start)) {
      throw new Error("OCCT backend: path segments are not connected");
    }
  }
  const wireBuilder = deps.newOcct("BRepBuilderAPI_MakeWire");
  for (const segment of segments) {
    if (!deps.addWireEdge(wireBuilder, segment.edge)) {
      throw new Error("OCCT backend: path wire builder missing Add()");
    }
  }
  if (typeof wireBuilder.Wire === "function") return wireBuilder.Wire();
  if (typeof wireBuilder.wire === "function") return wireBuilder.wire();
  if (wireBuilder.Shape) return wireBuilder.Shape();
  throw new Error("OCCT backend: path wire builder missing Wire()");
}

export function pathStartTangent(
  path: Path3D,
  deps: Pick<PathWireBuilderDeps, "point3Numbers">
): { start: [number, number, number]; tangent: [number, number, number] } {
  if (path.kind === "path.polyline") {
    if (path.points.length < 2) {
      throw new Error("OCCT backend: path needs at least 2 points");
    }
    const startPoint = path.points[0];
    const nextPoint = path.points[1];
    if (!startPoint || !nextPoint) {
      throw new Error("OCCT backend: path needs at least 2 points");
    }
    const start = deps.point3Numbers(startPoint, "path point");
    const next = deps.point3Numbers(nextPoint, "path point");
    return { start, tangent: subVec(next, start) };
  }
  if (path.kind === "path.spline") {
    if (path.points.length < 2) {
      throw new Error("OCCT backend: path needs at least 2 points");
    }
    const startPoint = path.points[0];
    const nextPoint = path.points[1];
    if (!startPoint || !nextPoint) {
      throw new Error("OCCT backend: path needs at least 2 points");
    }
    const start = deps.point3Numbers(startPoint, "path point");
    const next = deps.point3Numbers(nextPoint, "path point");
    return { start, tangent: subVec(next, start) };
  }
  if (path.segments.length === 0) {
    throw new Error("OCCT backend: path has no segments");
  }
  const first = path.segments[0];
  if (!first) {
    throw new Error("OCCT backend: path has no segments");
  }
  if (first.kind === "path.line") {
    const start = deps.point3Numbers(first.start, "path line start");
    const end = deps.point3Numbers(first.end, "path line end");
    return { start, tangent: subVec(end, start) };
  }
  if (first.kind === "path.arc") {
    const start = deps.point3Numbers(first.start, "path arc start");
    const end = deps.point3Numbers(first.end, "path arc end");
    const center = deps.point3Numbers(first.center, "path arc center");
    const mid = arcMidpointFromCenter(start, end, center, first.direction);
    return { start, tangent: subVec(mid, start) };
  }
  throw new Error("OCCT backend: unsupported path segment");
}

export function arcMidpointFromCenter(
  start: [number, number, number],
  end: [number, number, number],
  center: [number, number, number],
  direction?: "cw" | "ccw"
): [number, number, number] {
  const v1 = subVec(start, center);
  const v2 = subVec(end, center);
  const r1 = vecLength(v1);
  const r2 = vecLength(v2);
  if (Math.abs(r1 - r2) > 1e-5 || r1 === 0) {
    throw new Error("OCCT backend: path arc radius mismatch");
  }
  const n = normalizeVector(cross(v1, v2));
  if (!isFiniteVec(n)) {
    throw new Error("OCCT backend: path arc is degenerate");
  }
  const dotVal = clamp(dot(v1, v2) / (r1 * r2), -1, 1);
  const angle = Math.acos(dotVal);
  const axis = direction === "cw" ? scaleVec(n, -1) : n;
  const midVec = rotateAroundAxis(v1, axis, angle / 2);
  return addVec(center, midVec);
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
  vec: [number, number, number],
  scalar: number
): [number, number, number] {
  return [vec[0] * scalar, vec[1] * scalar, vec[2] * scalar];
}
