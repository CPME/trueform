import type { AxisDirection } from "../ir.js";
import { axisVector } from "./vector_math.js";

export type ShapePrimitiveDeps = {
  occt: any;
  newOcct: (name: string, ...args: unknown[]) => any;
};

export function makePrism(deps: ShapePrimitiveDeps, face: any, vec: any): any {
  try {
    return deps.newOcct("BRepPrimAPI_MakePrism", face, vec, false, true);
  } catch {
    return deps.newOcct("BRepPrimAPI_MakePrism", face, vec);
  }
}

export function makeRevol(
  deps: ShapePrimitiveDeps,
  face: any,
  axis: any,
  angleRad: number
): any {
  const candidates: Array<unknown[]> = [
    [face, axis, angleRad],
    [face, axis, angleRad, true],
    [face, axis],
  ];
  for (const args of candidates) {
    try {
      return deps.newOcct("BRepPrimAPI_MakeRevol", ...args);
    } catch {
      continue;
    }
  }
  throw new Error("OCCT backend: failed to construct BRepPrimAPI_MakeRevol");
}

export function makePnt(
  deps: ShapePrimitiveDeps,
  x: number,
  y: number,
  z: number
): any {
  const occt = deps.occt as any;
  if (occt.gp_Pnt_3) return new occt.gp_Pnt_3(x, y, z);
  throw new Error("OCCT backend: gp_Pnt_3 constructor not available");
}

export function makeDir(
  deps: ShapePrimitiveDeps,
  x: number,
  y: number,
  z: number
): any {
  const xyz = makeXYZ(deps, x, y, z);
  const occt = deps.occt as any;
  if (occt.gp_Dir_3) return new occt.gp_Dir_3(xyz);
  throw new Error("OCCT backend: gp_Dir_3 constructor not available");
}

export function makeVec(
  deps: ShapePrimitiveDeps,
  x: number,
  y: number,
  z: number
): any {
  const xyz = makeXYZ(deps, x, y, z);
  const occt = deps.occt as any;
  if (occt.gp_Vec_3) return new occt.gp_Vec_3(xyz);
  throw new Error("OCCT backend: gp_Vec_3 constructor not available");
}

export function makeXYZ(
  deps: ShapePrimitiveDeps,
  x: number,
  y: number,
  z: number
): any {
  const occt = deps.occt as any;
  if (occt.gp_XYZ_2) return new occt.gp_XYZ_2(x, y, z);
  throw new Error("OCCT backend: gp_XYZ_2 constructor not available");
}

export function makeAx2(deps: ShapePrimitiveDeps, pnt: any, dir: any): any {
  const occt = deps.occt as any;
  if (occt.gp_Ax2_3) return new occt.gp_Ax2_3(pnt, dir);
  throw new Error("OCCT backend: gp_Ax2_3 constructor not available");
}

export function makeAx2WithXDir(
  deps: ShapePrimitiveDeps,
  pnt: any,
  dir: any,
  xDir: any
): any {
  const occt = deps.occt as any;
  if (occt.gp_Ax2_2) return new occt.gp_Ax2_2(pnt, dir, xDir);
  return makeAx2(deps, pnt, dir);
}

export function makeAx1(deps: ShapePrimitiveDeps, pnt: any, dir: any): any {
  const occt = deps.occt as any;
  if (occt.gp_Ax1_2) return new occt.gp_Ax1_2(pnt, dir);
  if (occt.gp_Ax1_3) return new occt.gp_Ax1_3(pnt, dir);
  throw new Error("OCCT backend: gp_Ax1 constructor not available");
}

export function makePln(
  deps: ShapePrimitiveDeps,
  origin: [number, number, number],
  normal: [number, number, number]
): any {
  const pnt = makePnt(deps, origin[0], origin[1], origin[2]);
  const dir = makeDir(deps, normal[0], normal[1], normal[2]);
  return deps.newOcct("gp_Pln", pnt, dir);
}

export function makeAxis(
  deps: ShapePrimitiveDeps,
  dir: AxisDirection,
  origin?: [number, number, number]
): any {
  const [x, y, z] = axisVector(dir);
  const pnt = makePnt(deps, origin?.[0] ?? 0, origin?.[1] ?? 0, origin?.[2] ?? 0);
  const axisDir = makeDir(deps, x, y, z);
  return makeAx1(deps, pnt, axisDir);
}

export function makeCirc(deps: ShapePrimitiveDeps, ax2: any, radius: number): any {
  const occt = deps.occt as any;
  if (occt.gp_Circ_2) return new occt.gp_Circ_2(ax2, radius);
  throw new Error("OCCT backend: gp_Circ_2 constructor not available");
}
