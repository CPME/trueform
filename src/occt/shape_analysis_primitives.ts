import { cross, dot, isFiniteVec, normalizeVector } from "./vector_math.js";

export type ShapeBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

export type ShapeAnalysisPrimitiveDeps = {
  occt: any;
  newOcct: (name: string, ...args: unknown[]) => any;
  pointToArray: (point: any) => [number, number, number];
  toFace: (face: any) => any;
  callWithFallback: (target: any, methods: string[], argSets: unknown[][]) => unknown;
  callNumber: (target: any, name: string) => number;
};

export function shapeBounds(deps: ShapeAnalysisPrimitiveDeps, shape: any): ShapeBounds {
  const { occt } = deps;
  const box = deps.newOcct("Bnd_Box");
  if (!occt.BRepBndLib?.Add) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  occt.BRepBndLib.Add(shape, box, true);
  const min = deps.pointToArray(box.CornerMin());
  const max = deps.pointToArray(box.CornerMax());
  return { min, max };
}

export function firstFace(deps: ShapeAnalysisPrimitiveDeps, shape: any): any | null {
  const { occt } = deps;
  const explorer = new occt.TopExp_Explorer_1();
  explorer.Init(
    shape,
    occt.TopAbs_ShapeEnum.TopAbs_FACE,
    occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  if (!explorer.More()) return null;
  return deps.toFace(explorer.Current());
}

export function listFaces(deps: ShapeAnalysisPrimitiveDeps, shape: any): any[] {
  const { occt } = deps;
  const explorer = new occt.TopExp_Explorer_1();
  explorer.Init(
    shape,
    occt.TopAbs_ShapeEnum.TopAbs_FACE,
    occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  const faces: any[] = [];
  for (; explorer.More(); explorer.Next()) {
    faces.push(deps.toFace(explorer.Current()));
  }
  return faces;
}

export function countFaces(deps: ShapeAnalysisPrimitiveDeps, shape: any): number {
  const { occt } = deps;
  const explorer = new occt.TopExp_Explorer_1();
  explorer.Init(
    shape,
    occt.TopAbs_ShapeEnum.TopAbs_FACE,
    occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  let count = 0;
  for (; explorer.More(); explorer.Next()) count += 1;
  return count;
}

export function makeCompoundFromShapes(deps: ShapeAnalysisPrimitiveDeps, shapes: any[]): any {
  if (shapes.length === 0) {
    throw new Error("OCCT backend: cannot create compound from empty shape list");
  }
  if (shapes.length === 1) return shapes[0];
  const compound = deps.newOcct("TopoDS_Compound");
  const builder = deps.newOcct("BRep_Builder");
  deps.callWithFallback(builder, ["MakeCompound", "MakeCompound_1"], [[compound]]);
  for (const shape of shapes) {
    deps.callWithFallback(builder, ["Add", "Add_1"], [[compound, shape]]);
  }
  return compound;
}

export function axisBounds(
  axis: [number, number, number],
  bounds: ShapeBounds
): { min: number; max: number } | null {
  const corners: Array<[number, number, number]> = [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]],
  ];
  let min = Infinity;
  let max = -Infinity;
  for (const corner of corners) {
    const proj = dot(corner, axis);
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

export function cylinderReferenceXDirection(cylinder: {
  axis: [number, number, number];
  xDir?: [number, number, number];
  yDir?: [number, number, number];
}): [number, number, number] {
  const axis = normalizeVector(cylinder.axis);
  if (!isFiniteVec(axis)) return [1, 0, 0];

  const candidates: Array<[number, number, number] | undefined> = [
    cylinder.xDir,
    cylinder.yDir ? cross(cylinder.yDir, axis) : undefined,
    Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0],
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const projected: [number, number, number] = [
      candidate[0] - axis[0] * dot(candidate, axis),
      candidate[1] - axis[1] * dot(candidate, axis),
      candidate[2] - axis[2] * dot(candidate, axis),
    ];
    const normalized = normalizeVector(projected);
    if (isFiniteVec(normalized)) return normalized;
  }
  return [1, 0, 0];
}

export function cylinderVExtents(
  deps: ShapeAnalysisPrimitiveDeps,
  face: any,
  cylinder: { origin: [number, number, number]; axis: [number, number, number] }
): { min: number; max: number } | null {
  try {
    const faceHandle = deps.toFace(face);
    const adaptor = deps.newOcct("BRepAdaptor_Surface", faceHandle, true);
    const first = deps.callNumber(adaptor, "FirstVParameter");
    const last = deps.callNumber(adaptor, "LastVParameter");
    const axis = normalizeVector(cylinder.axis);
    if (!isFiniteVec(axis)) return null;
    const base = dot(cylinder.origin, axis);
    const min = base + Math.min(first, last);
    const max = base + Math.max(first, last);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
  } catch {
    const axis = normalizeVector(cylinder.axis);
    if (!isFiniteVec(axis)) return null;
    return axisBounds(axis, shapeBounds(deps, face));
  }
}

export function surfaceUvExtents(
  deps: ShapeAnalysisPrimitiveDeps,
  face: any
): { uMin: number; uMax: number; vMin: number; vMax: number } | null {
  try {
    const faceHandle = deps.toFace(face);
    const adaptor = deps.newOcct("BRepAdaptor_Surface", faceHandle, true);
    const u0 = deps.callNumber(adaptor, "FirstUParameter");
    const u1 = deps.callNumber(adaptor, "LastUParameter");
    const v0 = deps.callNumber(adaptor, "FirstVParameter");
    const v1 = deps.callNumber(adaptor, "LastVParameter");
    if (![u0, u1, v0, v1].every((value) => Number.isFinite(value))) {
      return null;
    }
    return {
      uMin: Math.min(u0, u1),
      uMax: Math.max(u0, u1),
      vMin: Math.min(v0, v1),
      vMax: Math.max(v0, v1),
    };
  } catch {
    return null;
  }
}

export function shapeCenter(
  deps: ShapeAnalysisPrimitiveDeps,
  shape: any
): [number, number, number] {
  const bounds = shapeBounds(deps, shape);
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}
