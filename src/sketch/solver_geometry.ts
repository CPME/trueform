import { CompileError } from "../errors.js";
import type { SketchEntity } from "../ir.js";
import {
  add,
  distance,
  dot,
  normalize,
  readNumericPoint,
  readPositiveRadius,
  scale,
  subtract,
  toFiniteNumber,
  vectorLength,
} from "./solver_math.js";

export type NumericPoint = [number, number];
export type NumericVector = [number, number];

export type LineAccessor = {
  readStart: () => NumericPoint;
  readEnd: () => NumericPoint;
  writeStart: (point: NumericPoint) => void;
  write: (start: NumericPoint, end: NumericPoint) => void;
  writeEnd: (point: NumericPoint) => void;
};

export type CurveCenterAccessor = {
  readCenter: () => NumericPoint;
  writeCenter: (center: NumericPoint) => number;
};

export type TangentCurveAccessor = CurveCenterAccessor & {
  readRadius: () => number;
};

export type RadiusTargetAccessor = {
  residual: (radius: number) => number;
  write: (radius: number) => number;
};

export function resolveLine(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  lineId: string
): LineAccessor {
  const entity = entityMap.get(lineId);
  if (!entity) {
    throw new CompileError(
      "sketch_constraint_reference_missing",
      `Sketch ${sketchId} references missing line ${lineId}`
    );
  }
  if (entity.kind !== "sketch.line") {
    throw new CompileError(
      "sketch_constraint_kind_mismatch",
      `Sketch ${sketchId} constraint line ${lineId} must reference a sketch.line`
    );
  }
  return {
    readStart: () => readNumericPoint(entity.start, `Sketch ${sketchId} line ${lineId} start`),
    readEnd: () => readNumericPoint(entity.end, `Sketch ${sketchId} line ${lineId} end`),
    writeStart: (point) => {
      entity.start = point;
    },
    write: (start, end) => {
      entity.start = start;
      entity.end = end;
    },
    writeEnd: (point) => {
      entity.end = point;
    },
  };
}

export function tryResolveLine(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  lineId: string
): LineAccessor | null {
  const entity = entityMap.get(lineId);
  if (!entity) {
    throw new CompileError(
      "sketch_constraint_reference_missing",
      `Sketch ${sketchId} references missing entity ${lineId}`
    );
  }
  if (entity.kind !== "sketch.line") return null;
  return resolveLine(sketchId, entityMap, lineId);
}

export function resolveConcentricCurve(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  curveId: string,
  solveEpsilon: number
): CurveCenterAccessor {
  const curve = tryResolveTangentCurve(sketchId, entityMap, curveId, solveEpsilon);
  if (curve) return curve;
  throw new CompileError(
    "sketch_constraint_kind_mismatch",
    `Sketch ${sketchId} concentric constraint curve ${curveId} must reference a sketch.circle or sketch.arc`
  );
}

export function tryResolveTangentCurve(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  curveId: string,
  solveEpsilon: number
): TangentCurveAccessor | null {
  const entity = entityMap.get(curveId);
  if (!entity) {
    throw new CompileError(
      "sketch_constraint_reference_missing",
      `Sketch ${sketchId} references missing entity ${curveId}`
    );
  }

  if (entity.kind === "sketch.circle") {
    return {
      readCenter: () => readNumericPoint(entity.center, `Sketch ${sketchId} circle ${curveId} center`),
      readRadius: () => readPositiveRadius(entity.radius, `Sketch ${sketchId} circle ${curveId} radius`),
      writeCenter: (nextCenter) => {
        const currentCenter = readNumericPoint(
          entity.center,
          `Sketch ${sketchId} circle ${curveId} center`
        );
        entity.center = nextCenter;
        return distance(currentCenter, nextCenter);
      },
    };
  }

  if (entity.kind === "sketch.arc") {
    return {
      readCenter: () => readNumericPoint(entity.center, `Sketch ${sketchId} arc ${curveId} center`),
      readRadius: () => {
        const center = readNumericPoint(entity.center, `Sketch ${sketchId} arc ${curveId} center`);
        const start = readNumericPoint(entity.start, `Sketch ${sketchId} arc ${curveId} start`);
        const end = readNumericPoint(entity.end, `Sketch ${sketchId} arc ${curveId} end`);
        const startRadius = distance(center, start);
        const endRadius = distance(center, end);
        if (startRadius <= solveEpsilon || endRadius <= solveEpsilon) {
          throw new CompileError(
            "sketch_constraint_invalid_reference",
            `Sketch ${sketchId} arc ${curveId} must have endpoints away from center`
          );
        }
        return (startRadius + endRadius) * 0.5;
      },
      writeCenter: (nextCenter) => {
        const currentCenter = readNumericPoint(entity.center, `Sketch ${sketchId} arc ${curveId} center`);
        const delta = subtract(nextCenter, currentCenter);
        const start = readNumericPoint(entity.start, `Sketch ${sketchId} arc ${curveId} start`);
        const end = readNumericPoint(entity.end, `Sketch ${sketchId} arc ${curveId} end`);
        entity.center = nextCenter;
        entity.start = add(start, delta);
        entity.end = add(end, delta);
        return distance(currentCenter, nextCenter);
      },
    };
  }

  return null;
}

export function projectCurveToLineTangency(
  referenceLine: LineAccessor,
  targetCurve: TangentCurveAccessor,
  solveEpsilon: number
): number {
  const lineStart = referenceLine.readStart();
  const lineEnd = referenceLine.readEnd();
  const axis = normalize(subtract(lineEnd, lineStart));
  const normal: NumericVector = [-axis[1], axis[0]];
  const center = targetCurve.readCenter();
  const signedDistance = dot(subtract(center, lineStart), normal);
  const radius = targetCurve.readRadius();
  const desiredSignedDistance =
    Math.abs(signedDistance) <= solveEpsilon ? radius : Math.sign(signedDistance) * radius;
  const nextCenter = add(center, scale(normal, desiredSignedDistance - signedDistance));
  return targetCurve.writeCenter(nextCenter);
}

export function projectLineToCurveTangency(
  targetLine: LineAccessor,
  referenceCurve: TangentCurveAccessor,
  solveEpsilon: number
): number {
  const lineStart = targetLine.readStart();
  const lineEnd = targetLine.readEnd();
  const axis = normalize(subtract(lineEnd, lineStart));
  const normal: NumericVector = [-axis[1], axis[0]];
  const center = referenceCurve.readCenter();
  const radius = referenceCurve.readRadius();
  const signedDistance = dot(subtract(center, lineStart), normal);
  const desiredSignedDistance =
    Math.abs(signedDistance) <= solveEpsilon ? radius : Math.sign(signedDistance) * radius;
  const shift = scale(normal, signedDistance - desiredSignedDistance);
  const nextStart = add(lineStart, shift);
  const nextEnd = add(lineEnd, shift);
  targetLine.write(nextStart, nextEnd);
  return distance(lineStart, nextStart);
}

export function projectCurveToCurveTangency(
  referenceCurve: TangentCurveAccessor,
  targetCurve: TangentCurveAccessor,
  solveEpsilon: number
): number {
  const referenceCenter = referenceCurve.readCenter();
  const targetCenter = targetCurve.readCenter();
  const referenceRadius = referenceCurve.readRadius();
  const targetRadius = targetCurve.readRadius();
  const centerDelta = subtract(targetCenter, referenceCenter);
  const centerDistance = vectorLength(centerDelta);
  const direction: NumericVector =
    centerDistance <= solveEpsilon ? [1, 0] : normalize(centerDelta);
  const expectedSeparation = preferredCurveSeparation(
    centerDistance,
    referenceRadius,
    targetRadius
  );
  const nextTargetCenter = add(referenceCenter, scale(direction, expectedSeparation));
  return targetCurve.writeCenter(nextTargetCenter);
}

export function preferredCurveSeparation(
  centerDistance: number,
  firstRadius: number,
  secondRadius: number
): number {
  const external = firstRadius + secondRadius;
  const internal = Math.abs(firstRadius - secondRadius);
  return Math.abs(centerDistance - external) <= Math.abs(centerDistance - internal)
    ? external
    : internal;
}

export function resolveRadiusTarget(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  curveId: string,
  solveEpsilon: number
): RadiusTargetAccessor {
  const entity = entityMap.get(curveId);
  if (!entity) {
    throw new CompileError(
      "sketch_constraint_reference_missing",
      `Sketch ${sketchId} references missing curve ${curveId}`
    );
  }

  if (entity.kind === "sketch.circle") {
    return {
      residual: (radius) =>
        Math.abs(
          toFiniteNumber(entity.radius, `Sketch ${sketchId} circle ${curveId} radius`) - radius
        ),
      write: (radius) => {
        const current = toFiniteNumber(
          entity.radius,
          `Sketch ${sketchId} circle ${curveId} radius`
        );
        entity.radius = radius;
        return Math.abs(current - radius);
      },
    };
  }

  if (entity.kind === "sketch.arc") {
    const readArc = (): {
      center: NumericPoint;
      start: NumericPoint;
      end: NumericPoint;
      startVector: NumericVector;
      endVector: NumericVector;
      startRadius: number;
      endRadius: number;
    } => {
      const center = readNumericPoint(entity.center, `Sketch ${sketchId} arc ${curveId} center`);
      const start = readNumericPoint(entity.start, `Sketch ${sketchId} arc ${curveId} start`);
      const end = readNumericPoint(entity.end, `Sketch ${sketchId} arc ${curveId} end`);
      const startVector = subtract(start, center);
      const endVector = subtract(end, center);
      const startRadius = vectorLength(startVector);
      const endRadius = vectorLength(endVector);
      if (startRadius <= solveEpsilon || endRadius <= solveEpsilon) {
        throw new CompileError(
          "sketch_constraint_invalid_reference",
          `Sketch ${sketchId} radius constraint on ${curveId} requires arc endpoints away from center`
        );
      }
      return {
        center,
        start,
        end,
        startVector,
        endVector,
        startRadius,
        endRadius,
      };
    };

    return {
      residual: (radius) => {
        const arc = readArc();
        return Math.max(
          Math.abs(arc.startRadius - radius),
          Math.abs(arc.endRadius - radius)
        );
      },
      write: (radius) => {
        const arc = readArc();
        const nextStart = add(arc.center, scale(normalize(arc.startVector), radius));
        const nextEnd = add(arc.center, scale(normalize(arc.endVector), radius));
        entity.start = nextStart;
        entity.end = nextEnd;
        return Math.max(distance(arc.start, nextStart), distance(arc.end, nextEnd));
      },
    };
  }

  throw new CompileError(
    "sketch_constraint_kind_mismatch",
    `Sketch ${sketchId} radius constraint ${curveId} must reference a sketch.circle or sketch.arc`
  );
}
