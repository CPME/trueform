import type { ExecuteInput, KernelResult } from "../backend.js";
import type { PlaneRef, Selector, Sketch2D } from "../ir.js";
import { cross, dot, isFiniteVec, normalizeVector } from "./vector_math.js";

export type PlaneBasis = {
  origin: [number, number, number];
  xDir: [number, number, number];
  yDir: [number, number, number];
  normal: [number, number, number];
};

type ResolvePlaneBasisDeps = {
  datumKey: (id: string) => string;
  planeBasisFromFace: (face: any) => PlaneBasis;
};

export type PlaneBasisFaceDeps = {
  occt: any;
  toFace: (face: any) => any;
  newOcct: (name: string, ...args: any[]) => any;
  call: (target: any, name: string, ...args: any[]) => any;
  pointToArray: (point: any) => [number, number, number];
  dirToArray: (dir: any) => [number, number, number];
};

export function resolveSketchPlane(params: {
  feature: Sketch2D;
  upstream: KernelResult;
  resolve: ExecuteInput["resolve"];
  deps: ResolvePlaneBasisDeps;
}): PlaneBasis {
  const { feature, upstream, resolve, deps } = params;
  const originOffset = feature.origin ?? [0, 0, 0];
  if (!feature.plane) {
    return {
      origin: originOffset,
      xDir: [1, 0, 0],
      yDir: [0, 1, 0],
      normal: [0, 0, 1],
    };
  }
  const basis = resolvePlaneBasis({
    planeRef: feature.plane,
    upstream,
    resolve,
    deps,
  });
  return {
    ...basis,
    origin: [
      basis.origin[0] + originOffset[0],
      basis.origin[1] + originOffset[1],
      basis.origin[2] + originOffset[2],
    ],
  };
}

export function resolvePlaneBasis(params: {
  planeRef: PlaneRef;
  upstream: KernelResult;
  resolve: ExecuteInput["resolve"];
  deps: ResolvePlaneBasisDeps;
}): PlaneBasis {
  const { planeRef, upstream, resolve, deps } = params;
  if (isSelectorRef(planeRef)) {
    try {
      const target = resolve(planeRef as Selector, upstream);
      if (target.kind !== "face") {
        throw new Error("OCCT backend: plane reference must resolve to a face");
      }
      const face = target.meta["shape"];
      if (!face) {
        throw new Error("OCCT backend: plane reference missing face shape");
      }
      return deps.planeBasisFromFace(face);
    } catch (err) {
      if ((planeRef as Selector).kind === "selector.named") {
        const selector = planeRef as { kind: "selector.named"; name: string };
        const fallback = namedPlaneBasisFallback(selector.name, upstream, deps);
        if (fallback) return fallback;
      }
      throw err;
    }
  }
  if (planeRef.kind === "plane.datum") {
    const datum = upstream.outputs.get(deps.datumKey(planeRef.ref));
    if (!datum || datum.kind !== "datum") {
      throw new Error(`OCCT backend: missing datum plane ${planeRef.ref}`);
    }
    const meta = datum.meta as Record<string, unknown>;
    if (meta.type !== "plane" && meta.type !== "frame") {
      throw new Error("OCCT backend: datum is not a plane or frame");
    }
    return {
      origin: meta.origin as [number, number, number],
      xDir: meta.xDir as [number, number, number],
      yDir: meta.yDir as [number, number, number],
      normal: meta.normal as [number, number, number],
    };
  }
  throw new Error("OCCT backend: unsupported plane reference");
}

export function planeBasisFromFace(params: { face: any; deps: PlaneBasisFaceDeps }): PlaneBasis {
  const { face, deps } = params;
  const faceHandle = deps.toFace(face);
  const adaptor = deps.newOcct("BRepAdaptor_Surface", faceHandle, true);
  const type = deps.call(adaptor, "GetType") as { value?: number } | undefined;
  const planeType = deps.occt.GeomAbs_SurfaceType?.GeomAbs_Plane;
  if (!planeType || typeof type?.value !== "number" || type.value !== planeType.value) {
    throw new Error("OCCT backend: sketch plane face is not planar");
  }
  const plane = deps.call(adaptor, "Plane");
  const pos = deps.call(plane, "Position");
  const loc = deps.call(pos, "Location");
  const xDir = deps.call(pos, "XDirection");
  const yDir = deps.call(pos, "YDirection");
  const normal = deps.call(pos, "Direction");
  return {
    origin: deps.pointToArray(loc),
    xDir: deps.dirToArray(xDir),
    yDir: deps.dirToArray(yDir),
    normal: deps.dirToArray(normal),
  };
}

export function planeBasisFromNormal(
  origin: [number, number, number],
  normal: [number, number, number]
): PlaneBasis {
  const n = normalizeVector(normal);
  if (!isFiniteVec(n)) {
    throw new Error("OCCT backend: sweep plane normal is degenerate");
  }
  const up: [number, number, number] = Math.abs(dot(n, [0, 0, 1])) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  let xDir = normalizeVector(cross(up, n));
  if (!isFiniteVec(xDir)) {
    xDir = normalizeVector(cross([0, 1, 0], n));
  }
  if (!isFiniteVec(xDir)) {
    throw new Error("OCCT backend: failed to build sweep plane basis");
  }
  const yDir = normalizeVector(cross(n, xDir));
  if (!isFiniteVec(yDir)) {
    throw new Error("OCCT backend: failed to build sweep plane basis");
  }
  return { origin, xDir, yDir, normal: n };
}

function isSelectorRef(ref: PlaneRef): ref is Selector {
  return (
    ref.kind === "selector.face" ||
    ref.kind === "selector.edge" ||
    ref.kind === "selector.solid" ||
    ref.kind === "selector.named"
  );
}

function namedPlaneBasisFallback(
  name: string,
  upstream: KernelResult,
  deps: ResolvePlaneBasisDeps
): PlaneBasis | null {
  const canonical = canonicalPlaneBasis(name);
  if (canonical) return canonical;
  return namedDatumPlaneBasis(name, upstream, deps);
}

function canonicalPlaneBasis(name: string): PlaneBasis | null {
  const normalized = name.trim().toLowerCase();
  if (normalized === "top") {
    return { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] };
  }
  if (normalized === "bottom") {
    return { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, -1, 0], normal: [0, 0, -1] };
  }
  if (normalized === "front") {
    return { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 0, -1], normal: [0, 1, 0] };
  }
  if (normalized === "back") {
    return { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 0, 1], normal: [0, -1, 0] };
  }
  if (normalized === "right") {
    return { origin: [0, 0, 0], xDir: [0, 1, 0], yDir: [0, 0, 1], normal: [1, 0, 0] };
  }
  if (normalized === "left") {
    return { origin: [0, 0, 0], xDir: [0, 1, 0], yDir: [0, 0, -1], normal: [-1, 0, 0] };
  }
  return null;
}

function namedDatumPlaneBasis(
  name: string,
  upstream: KernelResult,
  deps: ResolvePlaneBasisDeps
): PlaneBasis | null {
  const tokens = namedDatumKeys(name, deps);
  for (const key of tokens) {
    const datum = upstream.outputs.get(key);
    if (!datum || datum.kind !== "datum") continue;
    const meta = datum.meta as Record<string, unknown>;
    if (meta.type !== "plane" && meta.type !== "frame") continue;
    return {
      origin: meta.origin as [number, number, number],
      xDir: meta.xDir as [number, number, number],
      yDir: meta.yDir as [number, number, number],
      normal: meta.normal as [number, number, number],
    };
  }
  return null;
}

function namedDatumKeys(name: string, deps: ResolvePlaneBasisDeps): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  const keys = new Set<string>();
  if (trimmed.startsWith("datum:")) {
    keys.add(trimmed);
  } else {
    keys.add(deps.datumKey(trimmed));
  }
  return Array.from(keys);
}
