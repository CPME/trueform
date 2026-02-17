import type {
  DimensionAngle,
  DimensionDistance,
  FTIConstraint,
  GeometryRef,
  ID,
  IntentPart,
  ParamType,
  Scalar,
  Units,
} from "./ir.js";
import type { KernelResult, KernelSelection } from "./backend.js";
import { buildParamContext, normalizeScalar, type ParamOverrides } from "./params.js";
import { resolveSelector } from "./selectors.js";

export type DimensionStatus = "ok" | "fail" | "unsupported";

export type DimensionResult = {
  id: ID;
  kind: DimensionAngle["kind"] | DimensionDistance["kind"];
  status: DimensionStatus;
  ok: boolean;
  measured?: number;
  message?: string;
  details?: Record<string, unknown>;
};

export type DimensionEvalOptions = {
  overrides?: ParamOverrides;
  units?: Units;
  epsilon?: number;
};

export function evaluatePartDimensions(
  part: IntentPart,
  result: KernelResult,
  options: DimensionEvalOptions = {}
): DimensionResult[] {
  const dimensions = (part.constraints ?? []).filter(isDimensionConstraint);
  if (dimensions.length === 0) return [];

  const ctx = buildParamContext(part.params, options.overrides, options.units ?? "mm");
  const epsilon = options.epsilon ?? 1e-9;
  const resolution = toResolutionContext(result);
  const out: DimensionResult[] = [];

  for (const dimension of dimensions) {
    const scalarKind: ParamType =
      dimension.kind === "dimension.angle" ? "angle" : "length";
    let fromSel: KernelSelection;
    let toSel: KernelSelection;
    try {
      fromSel = resolveGeometryRef(dimension.from, resolution);
      toSel = resolveGeometryRef(dimension.to, resolution);
    } catch (err) {
      out.push({
        id: dimension.id,
        kind: dimension.kind,
        status: "unsupported",
        ok: false,
        message: errorMessage(err, "dimension references could not be resolved"),
      });
      continue;
    }

    let measured: number;
    try {
      measured =
        dimension.kind === "dimension.distance"
          ? distance(centerOf(fromSel), centerOf(toSel))
          : angle(directionOf(fromSel), directionOf(toSel));
    } catch (err) {
      out.push({
        id: dimension.id,
        kind: dimension.kind,
        status: "unsupported",
        ok: false,
        message: errorMessage(err, "dimension could not be measured from selection metadata"),
      });
      continue;
    }

    try {
      const nominal = toScalarValue(dimension.nominal, scalarKind, ctx);
      const tolerance = toScalarValue(dimension.tolerance, scalarKind, ctx);
      const plus = toScalarValue(dimension.plus, scalarKind, ctx);
      const minus = toScalarValue(dimension.minus, scalarKind, ctx);

      const hasSymmetric = tolerance !== undefined;
      const hasBilateral = plus !== undefined || minus !== undefined;
      if (hasSymmetric && hasBilateral) {
        out.push({
          id: dimension.id,
          kind: dimension.kind,
          status: "unsupported",
          ok: false,
          measured,
          message: "dimension cannot mix tolerance with plus/minus",
        });
        continue;
      }
      if (hasBilateral && (plus === undefined || minus === undefined)) {
        out.push({
          id: dimension.id,
          kind: dimension.kind,
          status: "unsupported",
          ok: false,
          measured,
          message: "dimension plus/minus must both be provided",
        });
        continue;
      }
      if ((hasSymmetric || hasBilateral) && nominal === undefined) {
        out.push({
          id: dimension.id,
          kind: dimension.kind,
          status: "unsupported",
          ok: false,
          measured,
          message: "dimension nominal is required when tolerance is provided",
        });
        continue;
      }

      let lower: number | undefined;
      let upper: number | undefined;
      if (nominal !== undefined && tolerance !== undefined) {
        lower = nominal - tolerance;
        upper = nominal + tolerance;
      } else if (nominal !== undefined && plus !== undefined && minus !== undefined) {
        lower = nominal - minus;
        upper = nominal + plus;
      }

      if (lower === undefined || upper === undefined) {
        out.push({
          id: dimension.id,
          kind: dimension.kind,
          status: "ok",
          ok: true,
          measured,
          details: {
            nominal,
            tolerance,
            plus,
            minus,
            from: fromSel.id,
            to: toSel.id,
          },
        });
        continue;
      }

      const ok = measured >= lower - epsilon && measured <= upper + epsilon;
      out.push({
        id: dimension.id,
        kind: dimension.kind,
        status: ok ? "ok" : "fail",
        ok,
        measured,
        details: {
          nominal,
          tolerance,
          plus,
          minus,
          lower,
          upper,
          from: fromSel.id,
          to: toSel.id,
        },
      });
    } catch (err) {
      out.push({
        id: dimension.id,
        kind: dimension.kind,
        status: "unsupported",
        ok: false,
        measured,
        message: errorMessage(err, "dimension scalar normalization failed"),
      });
    }
  }

  return out;
}

function isDimensionConstraint(
  value: FTIConstraint
): value is DimensionDistance | DimensionAngle {
  return value.kind === "dimension.distance" || value.kind === "dimension.angle";
}

function toResolutionContext(upstream: KernelResult) {
  const named = new Map<string, KernelSelection>();
  for (const [key, obj] of upstream.outputs) {
    if (
      obj.kind === "face" ||
      obj.kind === "edge" ||
      obj.kind === "solid" ||
      obj.kind === "surface"
    ) {
      named.set(key, { id: obj.id, kind: obj.kind, meta: obj.meta });
    }
  }
  return { selections: upstream.selections, named };
}

function resolveGeometryRef(
  ref: GeometryRef,
  ctx: ReturnType<typeof toResolutionContext>
): KernelSelection {
  return resolveSelector(ref.selector, ctx);
}

function toScalarValue(
  value: Scalar | undefined,
  kind: ParamType,
  ctx: ReturnType<typeof buildParamContext>
): number | undefined {
  if (value === undefined) return undefined;
  return normalizeScalar(value, kind, ctx);
}

function centerOf(selection: KernelSelection): [number, number, number] {
  const center = selection.meta["center"];
  if (
    !Array.isArray(center) ||
    center.length !== 3 ||
    center.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    throw new Error(`Selection ${selection.id} is missing center metadata`);
  }
  return center as [number, number, number];
}

function directionOf(selection: KernelSelection): [number, number, number] {
  const normalVec = selection.meta["normalVec"];
  if (
    Array.isArray(normalVec) &&
    normalVec.length === 3 &&
    normalVec.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  ) {
    return normalize(normalVec as [number, number, number]);
  }

  const normal = selection.meta["normal"];
  if (normal === "+X") return [1, 0, 0];
  if (normal === "-X") return [-1, 0, 0];
  if (normal === "+Y") return [0, 1, 0];
  if (normal === "-Y") return [0, -1, 0];
  if (normal === "+Z") return [0, 0, 1];
  if (normal === "-Z") return [0, 0, -1];
  throw new Error(`Selection ${selection.id} is missing direction metadata`);
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!(len > 0)) {
    throw new Error("Direction vector is degenerate");
  }
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function angle(a: [number, number, number], b: [number, number, number]): number {
  const cos = Math.max(-1, Math.min(1, dot(a, b)));
  return Math.acos(cos);
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
