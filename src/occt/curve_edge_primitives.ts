import { makeAx2, makeAx2WithXDir, makeCirc, makeDir, makePnt, type ShapePrimitiveDeps } from "./shape_primitives.js";

export type CurveEdgePrimitiveDeps = ShapePrimitiveDeps & {
  readShape: (builder: any) => any;
  call: (target: any, method: string, ...args: any[]) => any;
};

export function makeLineEdge(
  deps: CurveEdgePrimitiveDeps,
  start: [number, number, number],
  end: [number, number, number]
) {
  const p1 = makePnt(deps, start[0], start[1], start[2]);
  const p2 = makePnt(deps, end[0], end[1], end[2]);
  const builder = deps.newOcct("BRepBuilderAPI_MakeEdge", p1, p2);
  return deps.readShape(builder);
}

export function makeArcEdge(
  deps: CurveEdgePrimitiveDeps,
  start: [number, number, number],
  mid: [number, number, number],
  end: [number, number, number]
) {
  const p1 = makePnt(deps, start[0], start[1], start[2]);
  const p2 = makePnt(deps, mid[0], mid[1], mid[2]);
  const p3 = makePnt(deps, end[0], end[1], end[2]);
  try {
    const arc = deps.newOcct("GC_MakeArcOfCircle", p1, p2, p3);
    const curveHandle = deps.call(arc, "Value");
    const curve = curveHandle?.get ? curveHandle.get() : curveHandle;
    const curveBase = deps.newOcct("Handle_Geom_Curve", curve);
    const edgeBuilder = deps.newOcct("BRepBuilderAPI_MakeEdge", curveBase);
    return deps.readShape(edgeBuilder);
  } catch {
    try {
      const builder = deps.newOcct("BRepBuilderAPI_MakeEdge", p1, p2, p3);
      return deps.readShape(builder);
    } catch {
      return makeLineEdge(deps, start, end);
    }
  }
}

export function makeCircleEdge(
  deps: CurveEdgePrimitiveDeps,
  center: [number, number, number],
  radius: number,
  normal: [number, number, number]
) {
  const pnt = makePnt(deps, center[0], center[1], center[2]);
  const dir = makeDir(deps, normal[0], normal[1], normal[2]);
  const ax2 = makeAx2(deps, pnt, dir);
  const circ = makeCirc(deps, ax2, radius);
  const builder = deps.newOcct("BRepBuilderAPI_MakeEdge", circ);
  return deps.readShape(builder);
}

export function makeEllipseEdge(
  deps: CurveEdgePrimitiveDeps,
  center: [number, number, number],
  xDir: [number, number, number],
  normal: [number, number, number],
  major: number,
  minor: number
) {
  const pnt = makePnt(deps, center[0], center[1], center[2]);
  const dir = makeDir(deps, normal[0], normal[1], normal[2]);
  const xAxis = makeDir(deps, xDir[0], xDir[1], xDir[2]);
  const ax2 = makeAx2WithXDir(deps, pnt, dir, xAxis);
  const elips = deps.newOcct("gp_Elips", ax2, major, minor);
  const builder = deps.newOcct("BRepBuilderAPI_MakeEdge", elips);
  return deps.readShape(builder);
}
