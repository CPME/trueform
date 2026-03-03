import { CompileError } from "../errors.js";
import type { Point2D, SketchConstraint, SketchConstraintPointRef, SketchEntity } from "../ir.js";

type NumericPoint = [number, number];
type NumericVector = [number, number];

export type SketchConstraintSolveStatus = "fully-constrained" | "underconstrained";

export type SketchConstraintEntityStatus = {
  entityId: string;
  totalDegreesOfFreedom: number;
  remainingDegreesOfFreedom: number;
  status: SketchConstraintSolveStatus;
};

export type SketchConstraintSolveReport = {
  entities: SketchEntity[];
  totalDegreesOfFreedom: number;
  remainingDegreesOfFreedom: number;
  status: SketchConstraintSolveStatus;
  entityStatus: SketchConstraintEntityStatus[];
};

const SOLVE_EPSILON = 1e-9;
const SOLVE_TOLERANCE = 1e-6;

export function solveSketchConstraints(
  sketchId: string,
  entities: SketchEntity[],
  constraints: SketchConstraint[]
): SketchEntity[] {
  return solveSketchConstraintsDetailed(sketchId, entities, constraints).entities;
}

export function solveSketchConstraintsDetailed(
  sketchId: string,
  entities: SketchEntity[],
  constraints: SketchConstraint[]
): SketchConstraintSolveReport {
  if (constraints.length === 0) {
    return buildSolveReport(entities, constraints);
  }

  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  const maxIterations = Math.max(4, constraints.length * 4);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let maxDelta = 0;
    for (const constraint of constraints) {
      maxDelta = Math.max(maxDelta, applyConstraint(sketchId, entityMap, constraint));
    }
    if (maxDelta <= SOLVE_TOLERANCE) break;
  }

  for (const constraint of constraints) {
    const residual = measureConstraintResidual(sketchId, entityMap, constraint);
    if (residual > SOLVE_TOLERANCE * 10) {
      throw new CompileError(
        "sketch_constraint_unsatisfied",
        `Sketch ${sketchId} constraint ${constraint.id} could not be satisfied`
      );
    }
  }

  return buildSolveReport(entities, constraints);
}

function buildSolveReport(
  entities: SketchEntity[],
  constraints: SketchConstraint[]
): SketchConstraintSolveReport {
  const totalDegreesOfFreedom = entities.reduce(
    (sum, entity) => sum + estimateEntityDegreesOfFreedom(entity),
    0
  );
  const consumption = estimateConstraintConsumption(constraints);
  const remainingDegreesOfFreedom = Math.max(0, totalDegreesOfFreedom - consumption.totalConsumed);
  const perEntityStatus = entities.map((entity) => {
    const total = estimateEntityDegreesOfFreedom(entity);
    const consumed = Math.min(total, consumption.byEntity.get(entity.id) ?? 0);
    const remaining = Math.max(0, total - consumed);
    return {
      entityId: entity.id,
      totalDegreesOfFreedom: total,
      remainingDegreesOfFreedom: remaining,
      status:
        remaining === 0 ? "fully-constrained" : "underconstrained",
    } satisfies SketchConstraintEntityStatus;
  });
  return {
    entities,
    totalDegreesOfFreedom,
    remainingDegreesOfFreedom,
    status:
      remainingDegreesOfFreedom === 0 ? "fully-constrained" : "underconstrained",
    entityStatus: perEntityStatus,
  };
}

function estimateConstraintConsumption(
  constraints: SketchConstraint[]
): { totalConsumed: number; byEntity: Map<string, number> } {
  const byEntity = new Map<string, number>();
  let totalConsumed = 0;

  for (const constraint of constraints) {
    const consume = (entityId: string, amount: number): void => {
      totalConsumed += amount;
      byEntity.set(entityId, (byEntity.get(entityId) ?? 0) + amount);
    };

    switch (constraint.kind) {
      case "sketch.constraint.coincident":
        consume(constraint.b.entity, 2);
        break;
      case "sketch.constraint.horizontal":
      case "sketch.constraint.vertical":
        consume(constraint.line, 1);
        break;
      case "sketch.constraint.parallel":
      case "sketch.constraint.perpendicular":
      case "sketch.constraint.equalLength":
        consume(constraint.b, 1);
        break;
      case "sketch.constraint.distance":
        consume(constraint.b.entity, 1);
        break;
      case "sketch.constraint.fixPoint":
        consume(
          constraint.point.entity,
          (constraint.x === undefined ? 0 : 1) + (constraint.y === undefined ? 0 : 1)
        );
        break;
    }
  }

  return { totalConsumed, byEntity };
}

function estimateEntityDegreesOfFreedom(entity: SketchEntity): number {
  switch (entity.kind) {
    case "sketch.line":
      return 4;
    case "sketch.arc":
      return 6;
    case "sketch.circle":
    case "sketch.ellipse":
    case "sketch.slot":
    case "sketch.polygon":
    case "sketch.rectangle":
    case "sketch.point":
      return 2;
    case "sketch.spline":
      return 0;
  }
}

function applyConstraint(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraint: SketchConstraint
): number {
  switch (constraint.kind) {
    case "sketch.constraint.coincident": {
      const a = resolvePointRef(sketchId, entityMap, constraint.a);
      const b = resolvePointRef(sketchId, entityMap, constraint.b);
      const target = a.read();
      const before = b.read();
      b.write(target);
      return distance(before, target);
    }
    case "sketch.constraint.horizontal": {
      const line = resolveLine(sketchId, entityMap, constraint.line);
      const start = line.readStart();
      const end = line.readEnd();
      const next: NumericPoint = [end[0], start[1]];
      line.writeEnd(next);
      return Math.abs(end[1] - next[1]);
    }
    case "sketch.constraint.vertical": {
      const line = resolveLine(sketchId, entityMap, constraint.line);
      const start = line.readStart();
      const end = line.readEnd();
      const next: NumericPoint = [start[0], end[1]];
      line.writeEnd(next);
      return Math.abs(end[0] - next[0]);
    }
    case "sketch.constraint.parallel": {
      const reference = resolveLine(sketchId, entityMap, constraint.a);
      const target = resolveLine(sketchId, entityMap, constraint.b);
      const referenceStart = reference.readStart();
      const referenceEnd = reference.readEnd();
      const axis = lineDirection(referenceStart, referenceEnd, sketchId, constraint.id);
      const currentStart = target.readStart();
      const currentEnd = target.readEnd();
      const targetLength = targetLineLength(currentStart, currentEnd, distance(referenceStart, referenceEnd));
      const direction = chooseAlignedDirection(axis, subtract(currentEnd, currentStart));
      const next = add(currentStart, scale(direction, targetLength));
      target.writeEnd(next);
      return distance(currentEnd, next);
    }
    case "sketch.constraint.perpendicular": {
      const reference = resolveLine(sketchId, entityMap, constraint.a);
      const target = resolveLine(sketchId, entityMap, constraint.b);
      const referenceStart = reference.readStart();
      const referenceEnd = reference.readEnd();
      const axis = lineDirection(referenceStart, referenceEnd, sketchId, constraint.id);
      const baseCandidates = perpendicularDirections(axis);
      const currentStart = target.readStart();
      const currentEnd = target.readEnd();
      const targetLength = targetLineLength(currentStart, currentEnd, distance(referenceStart, referenceEnd));
      const direction = chooseClosestDirection(baseCandidates, subtract(currentEnd, currentStart));
      const next = add(currentStart, scale(direction, targetLength));
      target.writeEnd(next);
      return distance(currentEnd, next);
    }
    case "sketch.constraint.equalLength": {
      const reference = resolveLine(sketchId, entityMap, constraint.a);
      const target = resolveLine(sketchId, entityMap, constraint.b);
      const referenceStart = reference.readStart();
      const referenceEnd = reference.readEnd();
      const referenceVector = subtract(referenceEnd, referenceStart);
      const referenceLength = vectorLength(referenceVector);
      const currentStart = target.readStart();
      const currentEnd = target.readEnd();
      const currentVector = subtract(currentEnd, currentStart);
      const direction: NumericVector =
        vectorLength(currentVector) > SOLVE_EPSILON
          ? normalize(currentVector)
          : referenceLength > SOLVE_EPSILON
            ? normalize(referenceVector)
            : [1, 0];
      const next = add(currentStart, scale(direction, referenceLength));
      target.writeEnd(next);
      return distance(currentEnd, next);
    }
    case "sketch.constraint.distance": {
      const a = resolvePointRef(sketchId, entityMap, constraint.a);
      const b = resolvePointRef(sketchId, entityMap, constraint.b);
      if (samePointRef(constraint.a, constraint.b)) {
        throw new CompileError(
          "sketch_constraint_invalid_reference",
          `Sketch ${sketchId} distance constraint ${constraint.id} requires distinct point refs`
        );
      }
      const origin = a.read();
      const current = b.read();
      const delta = subtract(current, origin);
      const currentLength = vectorLength(delta);
      const targetDistance = toFiniteNumber(
        constraint.distance,
        `Sketch ${sketchId} distance constraint ${constraint.id}`
      );
      const direction: NumericVector =
        currentLength <= SOLVE_EPSILON ? [1, 0] : normalize(delta);
      const next = add(origin, scale(direction, targetDistance));
      b.write(next);
      return distance(current, next);
    }
    case "sketch.constraint.fixPoint": {
      const point = resolvePointRef(sketchId, entityMap, constraint.point);
      const current = point.read();
      const next: NumericPoint = [
        constraint.x === undefined
          ? current[0]
          : toFiniteNumber(constraint.x, `Sketch ${sketchId} fixPoint constraint ${constraint.id} x`),
        constraint.y === undefined
          ? current[1]
          : toFiniteNumber(constraint.y, `Sketch ${sketchId} fixPoint constraint ${constraint.id} y`),
      ];
      point.write(next);
      return distance(current, next);
    }
  }
}

function measureConstraintResidual(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraint: SketchConstraint
): number {
  switch (constraint.kind) {
    case "sketch.constraint.coincident": {
      const a = resolvePointRef(sketchId, entityMap, constraint.a);
      const b = resolvePointRef(sketchId, entityMap, constraint.b);
      return distance(a.read(), b.read());
    }
    case "sketch.constraint.horizontal": {
      const line = resolveLine(sketchId, entityMap, constraint.line);
      return Math.abs(line.readStart()[1] - line.readEnd()[1]);
    }
    case "sketch.constraint.vertical": {
      const line = resolveLine(sketchId, entityMap, constraint.line);
      return Math.abs(line.readStart()[0] - line.readEnd()[0]);
    }
    case "sketch.constraint.parallel": {
      const a = resolveLine(sketchId, entityMap, constraint.a);
      const b = resolveLine(sketchId, entityMap, constraint.b);
      const ref = lineDirection(a.readStart(), a.readEnd(), sketchId, constraint.id);
      const target = lineDirection(b.readStart(), b.readEnd(), sketchId, constraint.id);
      return Math.abs(cross(ref, target));
    }
    case "sketch.constraint.perpendicular": {
      const a = resolveLine(sketchId, entityMap, constraint.a);
      const b = resolveLine(sketchId, entityMap, constraint.b);
      const ref = lineDirection(a.readStart(), a.readEnd(), sketchId, constraint.id);
      const target = lineDirection(b.readStart(), b.readEnd(), sketchId, constraint.id);
      return Math.abs(dot(ref, target));
    }
    case "sketch.constraint.equalLength": {
      const a = resolveLine(sketchId, entityMap, constraint.a);
      const b = resolveLine(sketchId, entityMap, constraint.b);
      const refLength = distance(a.readStart(), a.readEnd());
      const targetLength = distance(b.readStart(), b.readEnd());
      return Math.abs(refLength - targetLength);
    }
    case "sketch.constraint.distance": {
      const a = resolvePointRef(sketchId, entityMap, constraint.a);
      const b = resolvePointRef(sketchId, entityMap, constraint.b);
      const expected = toFiniteNumber(
        constraint.distance,
        `Sketch ${sketchId} distance constraint ${constraint.id}`
      );
      return Math.abs(distance(a.read(), b.read()) - expected);
    }
    case "sketch.constraint.fixPoint": {
      const point = resolvePointRef(sketchId, entityMap, constraint.point);
      const current = point.read();
      let residual = 0;
      if (constraint.x !== undefined) {
        residual = Math.max(
          residual,
          Math.abs(current[0] - toFiniteNumber(constraint.x, `Sketch ${sketchId} fixPoint x`))
        );
      }
      if (constraint.y !== undefined) {
        residual = Math.max(
          residual,
          Math.abs(current[1] - toFiniteNumber(constraint.y, `Sketch ${sketchId} fixPoint y`))
        );
      }
      return residual;
    }
  }
}

function resolveLine(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  lineId: string
): {
  readStart: () => NumericPoint;
  readEnd: () => NumericPoint;
  writeEnd: (point: NumericPoint) => void;
} {
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
    writeEnd: (point) => {
      entity.end = point;
    },
  };
}

function resolvePointRef(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  ref: SketchConstraintPointRef
): {
  read: () => NumericPoint;
  write: (point: NumericPoint) => void;
} {
  const entity = entityMap.get(ref.entity);
  if (!entity) {
    throw new CompileError(
      "sketch_constraint_reference_missing",
      `Sketch ${sketchId} references missing entity ${ref.entity}`
    );
  }

  switch (entity.kind) {
    case "sketch.line":
      if (ref.handle === "start") {
        return pointAccessor(
          () => readNumericPoint(entity.start, `Sketch ${sketchId} line ${ref.entity} start`),
          (point) => {
            entity.start = point;
          }
        );
      }
      if (ref.handle === "end") {
        return pointAccessor(
          () => readNumericPoint(entity.end, `Sketch ${sketchId} line ${ref.entity} end`),
          (point) => {
            entity.end = point;
          }
        );
      }
      break;
    case "sketch.arc":
      if (ref.handle === "start") {
        return pointAccessor(
          () => readNumericPoint(entity.start, `Sketch ${sketchId} arc ${ref.entity} start`),
          (point) => {
            entity.start = point;
          }
        );
      }
      if (ref.handle === "end") {
        return pointAccessor(
          () => readNumericPoint(entity.end, `Sketch ${sketchId} arc ${ref.entity} end`),
          (point) => {
            entity.end = point;
          }
        );
      }
      if (ref.handle === "center" || ref.handle === undefined) {
        return pointAccessor(
          () => readNumericPoint(entity.center, `Sketch ${sketchId} arc ${ref.entity} center`),
          (point) => {
            entity.center = point;
          }
        );
      }
      break;
    case "sketch.circle":
    case "sketch.ellipse":
    case "sketch.slot":
    case "sketch.polygon":
      if (ref.handle === "center" || ref.handle === undefined) {
        return pointAccessor(
          () => readNumericPoint(entity.center, `Sketch ${sketchId} entity ${ref.entity} center`),
          (point) => {
            entity.center = point;
          }
        );
      }
      break;
    case "sketch.rectangle":
      if (entity.mode === "center" && (ref.handle === "center" || ref.handle === undefined)) {
        return pointAccessor(
          () => readNumericPoint(entity.center, `Sketch ${sketchId} rectangle ${ref.entity} center`),
          (point) => {
            entity.center = point;
          }
        );
      }
      if (entity.mode === "corner" && (ref.handle === "corner" || ref.handle === undefined)) {
        return pointAccessor(
          () => readNumericPoint(entity.corner, `Sketch ${sketchId} rectangle ${ref.entity} corner`),
          (point) => {
            entity.corner = point;
          }
        );
      }
      break;
    case "sketch.point":
      if (ref.handle === "point" || ref.handle === undefined) {
        return pointAccessor(
          () => readNumericPoint(entity.point, `Sketch ${sketchId} point ${ref.entity}`),
          (point) => {
            entity.point = point;
          }
        );
      }
      break;
    case "sketch.spline":
      break;
  }

  throw new CompileError(
    "sketch_constraint_kind_mismatch",
    `Sketch ${sketchId} ref ${ref.entity}${ref.handle ? `.${ref.handle}` : ""} is not supported`
  );
}

function pointAccessor(
  read: () => NumericPoint,
  write: (point: NumericPoint) => void
): {
  read: () => NumericPoint;
  write: (point: NumericPoint) => void;
} {
  return { read, write };
}

function readNumericPoint(point: Point2D, label: string): NumericPoint {
  return [
    toFiniteNumber(point[0], `${label} x`),
    toFiniteNumber(point[1], `${label} y`),
  ];
}

function toFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CompileError(
      "sketch_constraint_scalar_expected",
      `${label} must resolve to a finite number`
    );
  }
  return value;
}

function distance(a: NumericPoint, b: NumericPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function samePointRef(a: SketchConstraintPointRef, b: SketchConstraintPointRef): boolean {
  return a.entity === b.entity && (a.handle ?? null) === (b.handle ?? null);
}

function subtract(a: NumericPoint, b: NumericPoint): NumericVector {
  return [a[0] - b[0], a[1] - b[1]];
}

function add(point: NumericPoint, delta: NumericVector): NumericPoint {
  return [point[0] + delta[0], point[1] + delta[1]];
}

function scale(vector: NumericVector, scalar: number): NumericVector {
  return [vector[0] * scalar, vector[1] * scalar];
}

function dot(a: NumericVector, b: NumericVector): number {
  return a[0] * b[0] + a[1] * b[1];
}

function cross(a: NumericVector, b: NumericVector): number {
  return a[0] * b[1] - a[1] * b[0];
}

function vectorLength(vector: NumericVector): number {
  return Math.hypot(vector[0], vector[1]);
}

function normalize(vector: NumericVector): NumericVector {
  const length = vectorLength(vector);
  if (length <= SOLVE_EPSILON) return [1, 0];
  return [vector[0] / length, vector[1] / length];
}

function lineDirection(
  start: NumericPoint,
  end: NumericPoint,
  sketchId: string,
  constraintId: string
): NumericVector {
  const vector = subtract(end, start);
  const length = vectorLength(vector);
  if (length <= SOLVE_EPSILON) {
    throw new CompileError(
      "sketch_constraint_invalid_reference",
      `Sketch ${sketchId} constraint ${constraintId} references a zero-length line`
    );
  }
  return [vector[0] / length, vector[1] / length];
}

function targetLineLength(
  start: NumericPoint,
  end: NumericPoint,
  fallbackLength: number
): number {
  const currentLength = distance(start, end);
  if (currentLength > SOLVE_EPSILON) return currentLength;
  if (fallbackLength > SOLVE_EPSILON) return fallbackLength;
  return 1;
}

function chooseAlignedDirection(
  direction: NumericVector,
  current: NumericVector
): NumericVector {
  const positive = normalize(direction);
  const negative = scale(positive, -1);
  if (dot(current, positive) >= dot(current, negative)) return positive;
  return negative;
}

function perpendicularDirections(direction: NumericVector): [NumericVector, NumericVector] {
  const normalized = normalize(direction);
  return [
    [-normalized[1], normalized[0]],
    [normalized[1], -normalized[0]],
  ];
}

function chooseClosestDirection(
  candidates: [NumericVector, NumericVector],
  current: NumericVector
): NumericVector {
  if (dot(current, candidates[0]) >= dot(current, candidates[1])) {
    return candidates[0];
  }
  return candidates[1];
}
