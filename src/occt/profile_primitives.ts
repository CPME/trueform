import type { Point3D } from "../ir.js";
import { expectNumber } from "./vector_math.js";
import {
  makeAx2,
  makeCirc,
  makeDir,
  makePnt,
  type ShapePrimitiveDeps,
} from "./shape_primitives.js";

export type ProfilePrimitiveDeps = ShapePrimitiveDeps & {
  point3Numbers: (point: Point3D, label: string) => [number, number, number];
  readShape: (builder: any) => any;
  makeFaceFromWire: (wire: any) => any;
  readFace: (builder: any) => any;
  addWireEdge: (builder: any, edge: any) => boolean;
};

export function makeWireFromEdges(deps: ProfilePrimitiveDeps, edges: any[]) {
  const wireBuilder = deps.newOcct("BRepBuilderAPI_MakeWire");
  for (const edge of edges) {
    if (!deps.addWireEdge(wireBuilder, edge)) {
      throw new Error("OCCT backend: wire builder missing Add()");
    }
  }
  if (typeof wireBuilder.Wire === "function") return wireBuilder.Wire();
  if (typeof wireBuilder.wire === "function") return wireBuilder.wire();
  if (wireBuilder.Shape) return wireBuilder.Shape();
  throw new Error("OCCT backend: wire builder missing Wire()");
}

export function makePolygonWire(
  deps: ProfilePrimitiveDeps,
  points: [number, number, number][]
) {
  if (points.length < 3) {
    throw new Error("OCCT backend: polygon wire requires at least 3 points");
  }
  const edges: any[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    if (!start || !end) continue;
    edges.push(makeLineEdge(deps, start, end));
  }
  return makeWireFromEdges(deps, edges);
}

export function regularPolygonPoints(
  center: [number, number, number],
  xDir: [number, number, number],
  yDir: [number, number, number],
  radius: number,
  sides: number,
  rotation = 0
): [number, number, number][] {
  if (sides < 3) {
    throw new Error("OCCT backend: regular polygon requires at least 3 sides");
  }
  const points: [number, number, number][] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (Math.PI * 2 * i) / sides;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    points.push([
      center[0] + xDir[0] * radius * cos + yDir[0] * radius * sin,
      center[1] + xDir[1] * radius * cos + yDir[1] * radius * sin,
      center[2] + xDir[2] * radius * cos + yDir[2] * radius * sin,
    ]);
  }
  return points;
}

export function makeRectangleWire(
  deps: ProfilePrimitiveDeps,
  width: number,
  height: number,
  center?: Point3D
) {
  const [cx, cy, cz] = center ? deps.point3Numbers(center, "profile center") : [0, 0, 0];
  const hw = width / 2;
  const hh = height / 2;
  const p1 = makePnt(deps, cx - hw, cy - hh, cz);
  const p2 = makePnt(deps, cx + hw, cy - hh, cz);
  const p3 = makePnt(deps, cx + hw, cy + hh, cz);
  const p4 = makePnt(deps, cx - hw, cy + hh, cz);
  let poly = deps.newOcct("BRepBuilderAPI_MakePolygon");
  if (typeof poly.Add === "function") {
    poly.Add(p1);
    poly.Add(p2);
    poly.Add(p3);
    poly.Add(p4);
    if (typeof poly.Close === "function") poly.Close();
  } else {
    poly = deps.newOcct("BRepBuilderAPI_MakePolygon", p1, p2, p3, p4, true);
  }
  const wire = typeof poly.Wire === "function" ? poly.Wire() : poly.wire?.();
  if (!wire) {
    throw new Error("OCCT backend: rectangle wire builder missing Wire()");
  }
  return wire;
}

export function makeRectangleFace(
  deps: ProfilePrimitiveDeps,
  width: number,
  height: number,
  center?: Point3D
) {
  const wire = makeRectangleWire(deps, width, height, center);
  return deps.readFace(deps.makeFaceFromWire(wire));
}

export function makeCircleWire(
  deps: ProfilePrimitiveDeps,
  radius: number,
  center?: Point3D
) {
  const [cx, cy, cz] = center ? deps.point3Numbers(center, "profile center") : [0, 0, 0];
  const pnt = makePnt(deps, cx, cy, cz);
  const dir = makeDir(deps, 0, 0, 1);
  const ax2 = makeAx2(deps, pnt, dir);
  const circle = makeCirc(deps, ax2, radius);
  const edgeBuilder = deps.newOcct("BRepBuilderAPI_MakeEdge", circle);
  return makeWireFromEdges(deps, [deps.readShape(edgeBuilder)]);
}

export function makeCircleFace(
  deps: ProfilePrimitiveDeps,
  radius: number,
  center?: Point3D
) {
  const wire = makeCircleWire(deps, radius, center);
  return deps.readFace(deps.makeFaceFromWire(wire));
}

export function makeRegularPolygonWire(
  deps: ProfilePrimitiveDeps,
  sides: number,
  radius: number,
  center?: Point3D,
  rotation?: number
) {
  const count = Math.round(sides);
  if (count < 3) {
    throw new Error("OCCT backend: polygon profile must have at least 3 sides");
  }
  const rot = rotation === undefined ? 0 : expectNumber(rotation, "profile rotation");
  const centerVec: [number, number, number] = center
    ? deps.point3Numbers(center, "profile center")
    : [0, 0, 0];
  const points = regularPolygonPoints(centerVec, [1, 0, 0], [0, 1, 0], radius, count, rot);
  return makePolygonWire(deps, points);
}

export function makeRegularPolygonFace(
  deps: ProfilePrimitiveDeps,
  sides: number,
  radius: number,
  center?: Point3D,
  rotation?: number
) {
  const wire = makeRegularPolygonWire(deps, sides, radius, center, rotation);
  return deps.readFace(deps.makeFaceFromWire(wire));
}

function makeLineEdge(
  deps: ProfilePrimitiveDeps,
  start: [number, number, number],
  end: [number, number, number]
) {
  const p1 = makePnt(deps, start[0], start[1], start[2]);
  const p2 = makePnt(deps, end[0], end[1], end[2]);
  return deps.readShape(deps.newOcct("BRepBuilderAPI_MakeEdge", p1, p2));
}
