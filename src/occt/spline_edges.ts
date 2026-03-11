import type { Path3D, Point2D, Point3D, SketchEntity } from "../ir.js";
import type { PlaneBasis } from "./plane_basis.js";
import { expectNumber } from "./vector_math.js";

type SplineDeps = {
  newOcct: (name: string, ...args: any[]) => any;
  call: (target: any, method: string, ...args: any[]) => any;
  makePnt: (x: number, y: number, z: number) => any;
  readShape: (builder: any) => any;
  point2Numbers: (point: Point2D, label: string) => [number, number];
  point2To3: (point: Point2D, plane: PlaneBasis) => [number, number, number];
  point3Numbers: (point: Point3D, label: string) => [number, number, number];
  pointsClose: (a: [number, number, number], b: [number, number, number], tol?: number) => boolean;
  continuityC2: any;
};

export function makeSketchSplineEdge(params: {
  entity: Extract<SketchEntity, { kind: "sketch.spline" }>;
  plane: PlaneBasis;
  deps: SplineDeps;
}): { edge: any; start: [number, number, number]; end: [number, number, number]; closed: boolean } {
  const { entity, plane, deps } = params;
  const rawPoints = entity.points;
  if (rawPoints.length < 2) {
    throw new Error("OCCT backend: sketch spline must have at least 2 points");
  }
  const points = rawPoints.slice();
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    throw new Error("OCCT backend: sketch spline points missing");
  }
  const start2 = deps.point2Numbers(first, "sketch spline start");
  const end2 = deps.point2Numbers(last, "sketch spline end");
  const start = deps.point2To3([start2[0], start2[1]], plane);
  const end = deps.point2To3([end2[0], end2[1]], plane);
  const isClosed = entity.closed === true || deps.pointsClose(start, end);
  if (isClosed && points.length > 2) {
    const dx = Math.abs(start2[0] - end2[0]);
    const dy = Math.abs(start2[1] - end2[1]);
    if (dx > 1e-6 || dy > 1e-6) {
      points.push(first);
    }
  }
  const arr = deps.newOcct("TColgp_Array1OfPnt", 1, points.length);
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (!point) {
      throw new Error("OCCT backend: sketch spline point missing");
    }
    const p2 = deps.point2Numbers(point, "sketch spline point");
    const p3 = deps.point2To3([p2[0], p2[1]], plane);
    arr.SetValue(i + 1, deps.makePnt(p3[0], p3[1], p3[2]));
  }
  const degree =
    entity.degree === undefined ? 3 : Math.round(expectNumber(entity.degree, "sketch spline degree"));
  const deg = Math.max(1, Math.min(8, degree));
  const tol = 1e-6;
  const bspline = deps.newOcct(
    "GeomAPI_PointsToBSpline",
    arr,
    deg,
    deg,
    deps.continuityC2 ?? 0,
    tol
  );
  const curveHandle = deps.call(bspline, "Curve");
  const curve = curveHandle?.get ? curveHandle.get() : curveHandle;
  const curveBase = deps.newOcct("Handle_Geom_Curve", curve);
  const edgeBuilder = deps.newOcct("BRepBuilderAPI_MakeEdge", curveBase);
  const edge = deps.readShape(edgeBuilder);
  return { edge, start, end, closed: isClosed };
}

export function makePathSplineEdge(params: {
  path: Extract<Path3D, { kind: "path.spline" }>;
  deps: SplineDeps;
}): { edge: any; start: [number, number, number]; end: [number, number, number]; closed: boolean } {
  const { path, deps } = params;
  const rawPoints = path.points;
  if (rawPoints.length < 2) {
    throw new Error("OCCT backend: path spline must have at least 2 points");
  }
  const points = rawPoints.slice();
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    throw new Error("OCCT backend: path spline points missing");
  }
  const start = deps.point3Numbers(first, "path spline start");
  const end = deps.point3Numbers(last, "path spline end");
  const isClosed = path.closed === true || deps.pointsClose(start, end);
  if (isClosed && points.length > 2) {
    const dx = Math.abs(start[0] - end[0]);
    const dy = Math.abs(start[1] - end[1]);
    const dz = Math.abs(start[2] - end[2]);
    if (dx > 1e-6 || dy > 1e-6 || dz > 1e-6) {
      points.push(first);
    }
  }
  const arr = deps.newOcct("TColgp_Array1OfPnt", 1, points.length);
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (!point) {
      throw new Error("OCCT backend: path spline point missing");
    }
    const p3 = deps.point3Numbers(point, "path spline point");
    arr.SetValue(i + 1, deps.makePnt(p3[0], p3[1], p3[2]));
  }
  const degree =
    path.degree === undefined ? 3 : Math.round(expectNumber(path.degree, "path spline degree"));
  const deg = Math.max(1, Math.min(8, degree));
  const tol = 1e-6;
  const bspline = deps.newOcct(
    "GeomAPI_PointsToBSpline",
    arr,
    deg,
    deg,
    deps.continuityC2 ?? 0,
    tol
  );
  const curveHandle = deps.call(bspline, "Curve");
  const curve = curveHandle?.get ? curveHandle.get() : curveHandle;
  const curveBase = deps.newOcct("Handle_Geom_Curve", curve);
  const edgeBuilder = deps.newOcct("BRepBuilderAPI_MakeEdge", curveBase);
  const edge = deps.readShape(edgeBuilder);
  return { edge, start, end, closed: isClosed };
}
