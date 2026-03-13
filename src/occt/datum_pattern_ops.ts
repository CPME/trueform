import type { ExecuteInput, KernelResult, KernelSelection } from "../backend.js";
import type {
  AxisSpec,
  DatumAxis,
  DatumFrame,
  DatumPlane,
  ExtrudeAxis,
  ID,
  Point2D,
} from "../ir.js";
import type { PlaneBasis } from "./plane_basis.js";
import type { ResolvedProfile } from "./profile_resolution.js";
import { axisVector, dot, expectNumber, isFiniteVec, normalizeVector, rotateAroundAxis, cross } from "./vector_math.js";

export type DatumPatternContext = {
  resolveAxisSpec: (axis: AxisSpec, upstream: KernelResult, label: string) => [number, number, number];
  planeBasisFromFace: (face: unknown) => PlaneBasis;
};

export type DatumPatternDeps = {
  datumKey: (id: string) => string;
  patternKey: (id: string) => string;
  addVec: (a: [number, number, number], b: [number, number, number]) => [number, number, number];
  subVec: (a: [number, number, number], b: [number, number, number]) => [number, number, number];
  scaleVec: (v: [number, number, number], s: number) => [number, number, number];
  planeBasisFromFace: (face: unknown) => PlaneBasis;
  axisBounds: (
    axis: [number, number, number],
    bounds: { min: [number, number, number]; max: [number, number, number] }
  ) => { min: number; max: number } | null;
  shapeBounds: (shape: unknown) => { min: [number, number, number]; max: [number, number, number] };
};

export function execDatumPlane(
  deps: DatumPatternDeps,
  feature: DatumPlane,
  upstream: KernelResult,
  resolveAxisSpecFn: DatumPatternContext["resolveAxisSpec"]
): KernelResult {
  const normal = resolveAxisSpecFn(feature.normal, upstream, "datum plane normal");
  const origin = feature.origin ?? [0, 0, 0];
  const originVec: [number, number, number] = [
    expectNumber(origin[0], "datum plane origin[0]"),
    expectNumber(origin[1], "datum plane origin[1]"),
    expectNumber(origin[2], "datum plane origin[2]"),
  ];
  const xHint = feature.xAxis
    ? resolveAxisSpecFn(feature.xAxis, upstream, "datum plane xAxis")
    : undefined;
  const basis = basisFromNormal(deps, normal, xHint, originVec);
  return {
    outputs: new Map([
      [
        deps.datumKey(feature.id),
        {
          id: `${feature.id}:datum`,
          kind: "datum" as const,
          meta: { type: "plane", ...basis },
        },
      ],
    ]),
    selections: [],
  };
}

export function execDatumAxis(
  deps: DatumPatternDeps,
  feature: DatumAxis,
  upstream: KernelResult,
  resolveAxisSpecFn: DatumPatternContext["resolveAxisSpec"]
): KernelResult {
  const direction = resolveAxisSpecFn(feature.direction, upstream, "datum axis direction");
  const origin = feature.origin ?? [0, 0, 0];
  const originVec: [number, number, number] = [
    expectNumber(origin[0], "datum axis origin[0]"),
    expectNumber(origin[1], "datum axis origin[1]"),
    expectNumber(origin[2], "datum axis origin[2]"),
  ];
  return {
    outputs: new Map([
      [
        deps.datumKey(feature.id),
        {
          id: `${feature.id}:datum`,
          kind: "datum" as const,
          meta: { type: "axis", origin: originVec, direction },
        },
      ],
    ]),
    selections: [],
  };
}

export function execDatumFrame(
  deps: DatumPatternDeps,
  feature: DatumFrame,
  upstream: KernelResult,
  resolve: ExecuteInput["resolve"]
): KernelResult {
  const target = resolve(feature.on, upstream);
  if (target.kind !== "face") {
    throw new Error("OCCT backend: datum frame must resolve to a face");
  }
  const face = target.meta["shape"];
  if (!face) {
    throw new Error("OCCT backend: datum frame missing face shape");
  }
  const basis = deps.planeBasisFromFace(face);
  return {
    outputs: new Map([
      [
        deps.datumKey(feature.id),
        {
          id: `${feature.id}:datum`,
          kind: "datum" as const,
          meta: { type: "frame", ...basis },
        },
      ],
    ]),
    selections: [],
  };
}

export function resolveAxisSpec(
  deps: Pick<DatumPatternDeps, "datumKey">,
  axis: AxisSpec,
  upstream: KernelResult,
  label: string
): [number, number, number] {
  if (typeof axis === "string") {
    return axisVector(axis);
  }
  if (axis.kind === "axis.vector") {
    const dir = [
      expectNumber(axis.direction[0], `${label} direction[0]`),
      expectNumber(axis.direction[1], `${label} direction[1]`),
      expectNumber(axis.direction[2], `${label} direction[2]`),
    ] as [number, number, number];
    const normalized = normalizeVector(dir);
    if (!isFiniteVec(normalized)) {
      throw new Error(`OCCT backend: ${label} direction is invalid`);
    }
    return normalized;
  }
  const datum = upstream.outputs.get(deps.datumKey(axis.ref));
  if (!datum || datum.kind !== "datum") {
    throw new Error(`OCCT backend: missing datum axis ${axis.ref}`);
  }
  const meta = datum.meta as Record<string, unknown>;
  if (meta.type !== "axis") {
    throw new Error("OCCT backend: datum ref is not an axis");
  }
  const dir = meta.direction as [number, number, number];
  const normalized = normalizeVector(dir);
  if (!isFiniteVec(normalized)) {
    throw new Error(`OCCT backend: ${label} direction is invalid`);
  }
  return normalized;
}

export function resolveExtrudeAxis(
  deps: Pick<DatumPatternDeps, "datumKey" | "planeBasisFromFace">,
  axis: ExtrudeAxis | undefined,
  profile: ResolvedProfile,
  upstream: KernelResult
): [number, number, number] {
  if (!axis) return [0, 0, 1];
  if (typeof axis === "object" && axis.kind === "axis.sketch.normal") {
    if (profile.face) {
      return normalizeVector(deps.planeBasisFromFace(profile.face).normal);
    }
    if (profile.planeNormal) {
      const normalized = normalizeVector(profile.planeNormal);
      if (isFiniteVec(normalized)) return normalized;
    }
    throw new Error("OCCT backend: sketch normal requires a sketch profile");
  }
  return resolveAxisSpec(deps, axis as AxisSpec, upstream, "extrude axis");
}

export function basisFromNormal(
  deps: Pick<DatumPatternDeps, "subVec" | "scaleVec">,
  normal: [number, number, number],
  xHint: [number, number, number] | undefined,
  origin: [number, number, number]
): PlaneBasis {
  const n = normalizeVector(normal);
  if (!isFiniteVec(n)) {
    throw new Error("OCCT backend: datum plane normal is invalid");
  }
  let xDir = xHint ? normalizeVector(xHint) : defaultAxisForNormal(n);
  if (!isFiniteVec(xDir) || Math.abs(dot(xDir, n)) > 0.95) {
    xDir = defaultAxisForNormal(n);
  }
  const xOrth = deps.subVec(xDir, deps.scaleVec(n, dot(xDir, n)));
  xDir = normalizeVector(xOrth);
  if (!isFiniteVec(xDir)) {
    xDir = defaultAxisForNormal(n);
  }
  const yDir = normalizeVector(cross(n, xDir));
  return { origin, xDir, yDir, normal: n };
}

export function defaultAxisForNormal(normal: [number, number, number]): [number, number, number] {
  if (Math.abs(normal[0]) < 0.9) return [1, 0, 0];
  return [0, 1, 0];
}

export function offsetFromPlane(
  offset: Point2D,
  xDir: [number, number, number],
  yDir: [number, number, number]
): [number, number, number] {
  const dx = expectNumber(offset[0], "offset x");
  const dy = expectNumber(offset[1], "offset y");
  return [
    xDir[0] * dx + yDir[0] * dy,
    xDir[1] * dx + yDir[1] * dy,
    xDir[2] * dx + yDir[2] * dy,
  ];
}

export function resolvePattern(
  deps: Pick<DatumPatternDeps, "patternKey">,
  patternRef: ID,
  upstream: KernelResult
): Record<string, unknown> {
  const output = upstream.outputs.get(deps.patternKey(patternRef));
  if (!output || output.kind !== "pattern") {
    throw new Error(`OCCT backend: missing pattern ${patternRef}`);
  }
  return output.meta as Record<string, unknown>;
}

export function patternCenters(
  deps: Pick<DatumPatternDeps, "patternKey" | "addVec">,
  patternRef: ID,
  position: Point2D,
  holePlane: PlaneBasis,
  upstream: KernelResult
): Array<[number, number, number]> {
  const pattern = resolvePattern(deps, patternRef, upstream);
  const normal = pattern.normal as [number, number, number];
  if (Math.abs(dot(normalizeVector(normal), normalizeVector(holePlane.normal))) < 0.95) {
    throw new Error("OCCT backend: pattern plane does not match hole face");
  }
  const xDir = pattern.xDir as [number, number, number];
  const yDir = pattern.yDir as [number, number, number];
  const origin = pattern.origin as [number, number, number];
  const baseOffset = offsetFromPlane(position, xDir, yDir);

  if (pattern.type === "pattern.linear") {
    const spacing = pattern.spacing as [number, number];
    const count = pattern.count as [number, number];
    const countX = Math.max(1, Math.round(count[0]));
    const countY = Math.max(1, Math.round(count[1]));
    const centers: Array<[number, number, number]> = [];
    for (let i = 0; i < countX; i += 1) {
      for (let j = 0; j < countY; j += 1) {
        centers.push(
          deps.addVec(origin, [
            baseOffset[0] + xDir[0] * spacing[0] * i + yDir[0] * spacing[1] * j,
            baseOffset[1] + xDir[1] * spacing[0] * i + yDir[1] * spacing[1] * j,
            baseOffset[2] + xDir[2] * spacing[0] * i + yDir[2] * spacing[1] * j,
          ])
        );
      }
    }
    return centers;
  }

  const count = Math.max(1, Math.round(pattern.count as number));
  const axis = normalizeVector(pattern.axis as [number, number, number]);
  const centers: Array<[number, number, number]> = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count;
    centers.push(deps.addVec(origin, rotateAroundAxis(baseOffset, axis, angle)));
  }
  return centers;
}

export function resolveThinFeatureAxisSpan(
  deps: Pick<DatumPatternDeps, "axisBounds" | "shapeBounds">,
  axis: [number, number, number],
  origin: [number, number, number],
  requestedDepth: number,
  upstream: KernelResult
): { low: number; high: number } | null {
  const start = dot(origin, axis);
  const eps = 1e-6;

  let clampedPos: number | null = null;
  let clampedNeg: number | null = null;
  let foundSupport = false;

  for (const output of upstream.outputs.values()) {
    if (output.kind !== "solid") continue;
    const shape = output.meta["shape"];
    if (!shape) continue;
    const extents = deps.axisBounds(axis, deps.shapeBounds(shape));
    if (!extents) continue;
    if (start < extents.min - eps || start > extents.max + eps) continue;
    foundSupport = true;
    const positive = extents.max - start;
    const negative = start - extents.min;
    if (positive > eps) {
      clampedPos = clampedPos === null ? positive : Math.min(clampedPos, positive);
    }
    if (negative > eps) {
      clampedNeg = clampedNeg === null ? negative : Math.min(clampedNeg, negative);
    }
  }

  if (!foundSupport) return null;
  const low = clampedNeg === null ? 0 : -Math.min(requestedDepth, clampedNeg);
  const high = clampedPos === null ? requestedDepth : Math.min(requestedDepth, clampedPos);
  if (!(high - low > eps)) return null;
  return { low, high };
}
