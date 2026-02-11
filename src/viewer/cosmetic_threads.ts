import type { MeshData, KernelResult } from "../backend.js";
import type { IntentPart, CosmeticThread, Units, Scalar } from "../ir.js";
import { buildParamContext, normalizeScalar, type ParamOverrides } from "../params.js";
import {
  resolveSelector,
  type ResolutionContext,
  type Selection,
} from "../selectors.js";

type Vec3 = [number, number, number];

export type CosmeticThreadEdgeOptions = {
  segmentsPerRing?: number;
  minRings?: number;
  maxRings?: number;
  defaultRings?: number;
  units?: Units;
  overrides?: ParamOverrides;
};

export function buildResolutionContext(result: KernelResult): ResolutionContext {
  const named = new Map<string, Selection>();
  for (const [key, output] of result.outputs) {
    if (
      output.kind === "face" ||
      output.kind === "edge" ||
      output.kind === "solid" ||
      output.kind === "surface"
    ) {
      named.set(key, { id: output.id, kind: output.kind, meta: output.meta });
    }
  }
  return { selections: result.selections as Selection[], named };
}

export function appendCosmeticThreadEdges(
  mesh: MeshData,
  part: IntentPart,
  ctx: ResolutionContext,
  occt: any,
  opts?: CosmeticThreadEdgeOptions
): MeshData {
  const extra = cosmeticThreadEdgePositions(part, ctx, occt, opts);
  if (extra.length === 0) return mesh;
  const merged = (mesh.edgePositions ?? []).concat(extra);
  return { ...mesh, edgePositions: merged };
}

export function cosmeticThreadEdgePositions(
  part: IntentPart,
  ctx: ResolutionContext,
  occt: any,
  opts?: CosmeticThreadEdgeOptions
): number[] {
  const threads = part.cosmeticThreads ?? [];
  if (threads.length === 0) return [];

  const paramCtx = buildParamContextSafe(part, opts);

  const segmentsPerRing = clampInt(opts?.segmentsPerRing ?? 48, 12, 256);
  const minRings = clampInt(opts?.minRings ?? 3, 1, 256);
  const maxRings = clampInt(opts?.maxRings ?? 48, minRings, 512);
  const defaultRings = clampInt(opts?.defaultRings ?? 8, 2, maxRings);

  const segments: number[] = [];

  for (const thread of threads) {
    if (thread.kind !== "thread.cosmetic") continue;
    if (thread.target.kind !== "ref.surface") continue;
    const selection = resolveSelector(thread.target.selector, ctx);
    if (selection.kind !== "face") continue;
    const face = selection.meta["shape"];
    if (!face) continue;

    const cylinder = cylinderFromFace(occt, face);
    if (!cylinder) continue;

    const axis = normalizeVec(cylinder.axis);
    if (!isFiniteVec(axis)) continue;

    const projection =
      cylinderVExtents(occt, face, cylinder) ?? axisExtents(axis, shapeBounds(occt, face));
    const axisExtent = projection.max - projection.min;
    if (!(axisExtent > 0)) continue;

    const resolvedLength = resolveLengthScalar(thread.length, paramCtx);
    const length = resolvedLength ?? axisExtent;
    if (!(length > 0)) continue;
    const clampedLength = Math.min(length, axisExtent);

    const pitch = resolvePitch(thread, clampedLength, defaultRings, paramCtx);
    const ringCount = clampInt(Math.round(clampedLength / pitch) + 1, minRings, maxRings);
    const spacing = ringCount > 1 ? clampedLength / (ringCount - 1) : 0;

    const axisOrigin = cylinder.origin;
    const axisOriginProj = dot(axisOrigin, axis);
    const midProj = (projection.min + projection.max) * 0.5;
    const startProj = midProj - clampedLength * 0.5;

    const basis = basisFromAxis(axis);
    const radius = cylinder.radius;

    for (let i = 0; i < ringCount; i += 1) {
      const proj = startProj + spacing * i;
      const center = addVec(axisOrigin, scaleVec(axis, proj - axisOriginProj));
      appendRing(segments, center, basis.xDir, basis.yDir, radius, segmentsPerRing);
    }
  }

  return segments;
}

function resolvePitch(
  thread: CosmeticThread,
  length: number,
  defaultRings: number,
  ctx: ParamContext | null
): number {
  const pitch =
    resolveLengthScalar(thread.pitch, ctx) ??
    parsePitch(thread.designation ?? "") ??
    (defaultRings > 1 ? length / (defaultRings - 1) : length);
  return Math.max(1e-3, pitch);
}

type ParamContext = ReturnType<typeof buildParamContext>;

function buildParamContextSafe(
  part: IntentPart,
  opts: CosmeticThreadEdgeOptions | undefined
): ParamContext | null {
  try {
    return buildParamContext(part.params, opts?.overrides, opts?.units ?? "mm");
  } catch {
    return null;
  }
}

function resolveLengthScalar(
  value: Scalar | undefined,
  ctx: ParamContext | null
): number | null {
  if (value === undefined) return null;
  if (!ctx) {
    return typeof value === "number"
      ? value
      : value.kind === "expr.literal"
        ? value.value
        : null;
  }
  try {
    return normalizeScalar(value, "length", ctx);
  } catch {
    return null;
  }
}

function parsePitch(designation: string): number | null {
  const match = designation.match(/[xX]\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function appendRing(
  segments: number[],
  center: Vec3,
  xDir: Vec3,
  yDir: Vec3,
  radius: number,
  ringSegments: number
): void {
  const step = (Math.PI * 2) / ringSegments;
  let prev = pointOnCircle(center, xDir, yDir, radius, 0);
  for (let i = 1; i <= ringSegments; i += 1) {
    const angle = step * i;
    const next = pointOnCircle(center, xDir, yDir, radius, angle);
    segments.push(prev[0], prev[1], prev[2], next[0], next[1], next[2]);
    prev = next;
  }
}

function pointOnCircle(
  center: Vec3,
  xDir: Vec3,
  yDir: Vec3,
  radius: number,
  angle: number
): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return addVec(
    center,
    addVec(scaleVec(xDir, radius * cos), scaleVec(yDir, radius * sin))
  );
}

function axisExtents(axis: Vec3, bounds: { min: Vec3; max: Vec3 }) {
  const corners: Vec3[] = [
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
  return { min, max };
}

function cylinderFromFace(
  occt: any,
  face: any
): { origin: Vec3; axis: Vec3; radius: number } | null {
  try {
    const faceHandle = toFace(occt, face);
    const adaptor = newOcct(occt, "BRepAdaptor_Surface", faceHandle, true);
    const type = call(adaptor, ["GetType"]);
    const cylinderType = occt.GeomAbs_SurfaceType?.GeomAbs_Cylinder;
    if (!type || !cylinderType || type.value !== cylinderType.value) return null;
    const cylinder = call(adaptor, ["Cylinder", "Cylinder_1"]);
    if (!cylinder) return null;
    const axis = call(cylinder, ["Axis", "Axis_1", "Axis_2"]);
    const dir = axis ? call(axis, ["Direction", "Direction_1"]) : null;
    const loc = axis ? call(axis, ["Location", "Location_1"]) : null;
    const radius = callNumber(cylinder, ["Radius", "Radius_1"]);
    if (!dir || !loc || typeof radius !== "number") return null;
    return {
      origin: pointToArray(loc),
      axis: dirToArray(dir),
      radius,
    };
  } catch {
    return null;
  }
}

function shapeBounds(occt: any, shape: any): { min: Vec3; max: Vec3 } {
  const box = newOcct(occt, "Bnd_Box");
  if (!occt.BRepBndLib?.Add) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  occt.BRepBndLib.Add(shape, box, true);
  return {
    min: pointToArray(box.CornerMin()),
    max: pointToArray(box.CornerMax()),
  };
}

function cylinderVExtents(
  occt: any,
  face: any,
  cylinder: { origin: Vec3; axis: Vec3 }
): { min: number; max: number } | null {
  try {
    const faceHandle = toFace(occt, face);
    const adaptor = newOcct(occt, "BRepAdaptor_Surface", faceHandle, true);
    const first = callNumber(adaptor, ["FirstVParameter", "FirstVParameter_1"]);
    const last = callNumber(adaptor, ["LastVParameter", "LastVParameter_1"]);
    if (first === null || last === null) return null;
    const axis = normalizeVec(cylinder.axis);
    if (!isFiniteVec(axis)) return null;
    const base = dot(cylinder.origin, axis);
    const min = base + Math.min(first, last);
    const max = base + Math.max(first, last);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
  } catch {
    return null;
  }
}

function basisFromAxis(axis: Vec3): { xDir: Vec3; yDir: Vec3 } {
  const n = normalizeVec(axis);
  const ref: Vec3 = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  let xDir = normalizeVec(cross(ref, n));
  if (!isFiniteVec(xDir)) {
    xDir = normalizeVec(cross([0, 1, 0], n));
  }
  const yDir = normalizeVec(cross(n, xDir));
  return { xDir, yDir };
}

function newOcct(occt: any, name: string, ...args: unknown[]) {
  const candidates = [name];
  for (let i = 1; i <= 25; i += 1) candidates.push(`${name}_${i}`);
  for (const key of candidates) {
    const Ctor = occt[key];
    if (!Ctor) continue;
    try {
      return new Ctor(...args);
    } catch {
      continue;
    }
  }
  throw new Error(`Cosmetic thread: no constructor for ${name}`);
}

function toFace(occt: any, face: any) {
  if (occt.TopoDS?.Face_1) {
    return occt.TopoDS.Face_1(face);
  }
  return face;
}

function call(obj: any, names: string[], args: unknown[] = []) {
  for (const name of names) {
    const fn = obj?.[name];
    if (typeof fn !== "function") continue;
    return fn.call(obj, ...args);
  }
  return null;
}

function callNumber(obj: any, names: string[]): number | null {
  for (const name of names) {
    const fn = obj?.[name];
    if (typeof fn !== "function") continue;
    const value = fn.call(obj);
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function pointToArray(pnt: any): Vec3 {
  if (typeof pnt.X === "function") {
    return [pnt.X(), pnt.Y(), pnt.Z()];
  }
  if (typeof pnt.x === "function") {
    return [pnt.x(), pnt.y(), pnt.z()];
  }
  if (typeof pnt.Coord === "function") {
    const out = { value: [] as number[] };
    pnt.Coord(out);
    const coords = out.value;
    return [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0];
  }
  throw new Error("Cosmetic thread: unsupported point type");
}

function dirToArray(dir: any): Vec3 {
  if (typeof dir.X === "function") {
    return [dir.X(), dir.Y(), dir.Z()];
  }
  if (typeof dir.x === "function") {
    return [dir.x(), dir.y(), dir.z()];
  }
  if (typeof dir.Coord === "function") {
    const out = { value: [] as number[] };
    dir.Coord(out);
    const coords = out.value;
    return [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0];
  }
  throw new Error("Cosmetic thread: unsupported direction type");
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleVec(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function normalizeVec(vec: Vec3): Vec3 {
  const len = Math.hypot(vec[0], vec[1], vec[2]);
  if (len < 1e-9) return [0, 0, 0];
  return [vec[0] / len, vec[1] / len, vec[2] / len];
}

function isFiniteVec(vec: Vec3): boolean {
  return Number.isFinite(vec[0]) && Number.isFinite(vec[1]) && Number.isFinite(vec[2]);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
