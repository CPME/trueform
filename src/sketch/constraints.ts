import { CompileError } from "../errors.js";
import type { Point2D, SketchConstraint, SketchConstraintPointRef, SketchEntity } from "../ir.js";

type NumericPoint = [number, number];

const SOLVE_EPSILON = 1e-9;
const SOLVE_TOLERANCE = 1e-6;

export function solveSketchConstraints(
  sketchId: string,
  entities: SketchEntity[],
  constraints: SketchConstraint[]
): SketchEntity[] {
  if (constraints.length === 0) return entities;

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

  return entities;
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
      const dx = current[0] - origin[0];
      const dy = current[1] - origin[1];
      const currentLength = Math.hypot(dx, dy);
      const targetDistance = toFiniteNumber(
        constraint.distance,
        `Sketch ${sketchId} distance constraint ${constraint.id}`
      );
      const next: NumericPoint =
        currentLength <= SOLVE_EPSILON
          ? [origin[0] + targetDistance, origin[1]]
          : [origin[0] + (dx * targetDistance) / currentLength, origin[1] + (dy * targetDistance) / currentLength];
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
