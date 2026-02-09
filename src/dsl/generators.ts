import type {
  AngleUnit,
  Expr,
  IntentFeature,
  Point2D,
  Point3D,
  Scalar,
  SketchEntity,
  SketchProfile,
} from "../ir.js";
import { exprAdd, exprLiteral, exprMul } from "./core.js";

export type ArrayOrder = "row-major" | "column-major";
export type ArrayDirection = "cw" | "ccw";

export type SketchArrayLayout = {
  count: [number, number];
  spacing: [Scalar, Scalar];
  origin?: Point2D;
  order?: ArrayOrder;
};

export type SketchArrayItem = {
  index: number;
  row: number;
  col: number;
  offset: Point2D;
};

export type FeatureArrayLayout = {
  count: [number, number];
  spacing: [Scalar, Scalar];
  origin?: Point3D;
  order?: ArrayOrder;
};

export type FeatureArrayItem = {
  index: number;
  row: number;
  col: number;
  offset: Point3D;
};

export type CircularArrayLayout2D = {
  count: number;
  radius: number;
  center?: [number, number];
  startAngle?: number;
  endAngle?: number;
  sweep?: number;
  units?: AngleUnit;
  direction?: ArrayDirection;
};

export type CircularArrayLayout3D = {
  count: number;
  radius: number;
  center?: [number, number, number];
  startAngle?: number;
  endAngle?: number;
  sweep?: number;
  units?: AngleUnit;
  direction?: ArrayDirection;
};

export type CircularArrayItem2D = {
  index: number;
  angle: number;
  offset: Point2D;
};

export type CircularArrayItem3D = {
  index: number;
  angle: number;
  offset: Point3D;
};

export type RadialArrayLayout2D = {
  count: [number, number];
  radiusStep: number;
  radiusStart?: number;
  center?: [number, number];
  startAngle?: number;
  angleStep?: number;
  sweep?: number;
  units?: AngleUnit;
  direction?: ArrayDirection;
  order?: ArrayOrder;
};

export type RadialArrayLayout3D = {
  count: [number, number];
  radiusStep: number;
  radiusStart?: number;
  center?: [number, number, number];
  startAngle?: number;
  angleStep?: number;
  sweep?: number;
  units?: AngleUnit;
  direction?: ArrayDirection;
  order?: ArrayOrder;
};

export type RadialArrayItem2D = {
  index: number;
  row: number;
  col: number;
  radius: number;
  angle: number;
  offset: Point2D;
};

export type RadialArrayItem3D = {
  index: number;
  row: number;
  col: number;
  radius: number;
  angle: number;
  offset: Point3D;
};

export type SplineArrayLayout2D = {
  points: Array<[number, number]>;
  count: number;
  closed?: boolean;
  mode?: "spline" | "polyline";
  tension?: number;
};

export type SplineArrayLayout3D = {
  points: Array<[number, number, number]>;
  count: number;
  closed?: boolean;
  mode?: "spline" | "polyline";
  tension?: number;
};

export type SplineArrayItem2D = {
  index: number;
  t: number;
  offset: Point2D;
  tangent?: Point2D;
};

export type SplineArrayItem3D = {
  index: number;
  t: number;
  offset: Point3D;
  tangent?: Point3D;
};

const toExpr = (value: Scalar): Expr =>
  typeof value === "number" ? exprLiteral(value) : value;

const addScalar = (left: Scalar, right: Scalar): Scalar => {
  if (typeof left === "number" && typeof right === "number") {
    return left + right;
  }
  return exprAdd(toExpr(left), toExpr(right));
};

const mulScalar = (left: Scalar, right: Scalar): Scalar => {
  if (typeof left === "number" && typeof right === "number") {
    return left * right;
  }
  return exprMul(toExpr(left), toExpr(right));
};

const ensureCount = (value: number, label: string) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Array layout ${label} must be a non-negative integer`);
  }
};

const ensureFiniteNumber = (value: number, label: string) => {
  if (!Number.isFinite(value)) {
    throw new Error(`Array layout ${label} must be a finite number`);
  }
};

const pushResult = <T>(target: T[], value: T | T[]) => {
  if (Array.isArray(value)) {
    target.push(...value);
  } else {
    target.push(value);
  }
};

const buildArray2D = <T>(
  count: [number, number],
  order: ArrayOrder,
  make: (row: number, col: number, index: number) => T | T[]
): T[] => {
  const [cols, rows] = count;
  ensureCount(cols, "count[0]");
  ensureCount(rows, "count[1]");

  const result: T[] = [];
  let index = 0;

  const emit = (row: number, col: number) => {
    const value = make(row, col, index);
    index += 1;
    pushResult(result, value);
  };

  if (order === "column-major") {
    for (let col = 0; col < cols; col += 1) {
      for (let row = 0; row < rows; row += 1) {
        emit(row, col);
      }
    }
    return result;
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      emit(row, col);
    }
  }

  return result;
};

const toRadians = (value: number, units: AngleUnit): number =>
  units === "deg" ? (value * Math.PI) / 180 : value;

const resolveSweep = (
  startAngle: number,
  layout: { endAngle?: number; sweep?: number; units: AngleUnit }
): number => {
  if (layout.endAngle !== undefined) {
    return toRadians(layout.endAngle, layout.units) - startAngle;
  }
  const sweep = layout.sweep ?? (layout.units === "deg" ? 360 : Math.PI * 2);
  return toRadians(sweep, layout.units);
};

const sweepStep = (count: number, sweep: number): number => {
  if (count <= 1) return 0;
  const fullCircle = Math.abs(sweep) >= Math.PI * 2 - 1e-6;
  return fullCircle ? sweep / count : sweep / (count - 1);
};

const normalizeDirection = (sweep: number, direction?: ArrayDirection): number => {
  if (!direction) return sweep;
  if (direction === "cw" && sweep > 0) return -sweep;
  if (direction === "ccw" && sweep < 0) return -sweep;
  return sweep;
};

const point2 = (x: number, y: number): [number, number] => [x, y];
const point3 = (x: number, y: number, z: number): [number, number, number] => [x, y, z];

const dist2 = (a: [number, number], b: [number, number]): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.hypot(dx, dy);
};

const dist3 = (a: [number, number, number], b: [number, number, number]): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.hypot(dx, dy, dz);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerp2 = (
  a: [number, number],
  b: [number, number],
  t: number
): [number, number] => point2(lerp(a[0], b[0], t), lerp(a[1], b[1], t));

const lerp3 = (
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] =>
  point3(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));

const normalize2 = (v: [number, number]): [number, number] => {
  const len = Math.hypot(v[0], v[1]);
  if (!Number.isFinite(len) || len === 0) return [0, 0];
  return [v[0] / len, v[1] / len];
};

const normalize3 = (v: [number, number, number]): [number, number, number] => {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(len) || len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
};

const catmullRom2 = (
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
  alpha: number
): [number, number] => {
  const t0 = 0;
  const t1 = t0 + Math.pow(dist2(p0, p1), alpha);
  const t2 = t1 + Math.pow(dist2(p1, p2), alpha);
  const t3 = t2 + Math.pow(dist2(p2, p3), alpha);
  const tt = lerp(t1, t2, t);

  const a1 = lerp2(p0, p1, t1 === t0 ? 0 : (tt - t0) / (t1 - t0));
  const a2 = lerp2(p1, p2, t2 === t1 ? 0 : (tt - t1) / (t2 - t1));
  const a3 = lerp2(p2, p3, t3 === t2 ? 0 : (tt - t2) / (t3 - t2));

  const b1 = lerp2(a1, a2, t2 === t0 ? 0 : (tt - t0) / (t2 - t0));
  const b2 = lerp2(a2, a3, t3 === t1 ? 0 : (tt - t1) / (t3 - t1));

  return lerp2(b1, b2, t2 === t1 ? 0 : (tt - t1) / (t2 - t1));
};

const catmullRom3 = (
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number],
  t: number,
  alpha: number
): [number, number, number] => {
  const t0 = 0;
  const t1 = t0 + Math.pow(dist3(p0, p1), alpha);
  const t2 = t1 + Math.pow(dist3(p1, p2), alpha);
  const t3 = t2 + Math.pow(dist3(p2, p3), alpha);
  const tt = lerp(t1, t2, t);

  const a1 = lerp3(p0, p1, t1 === t0 ? 0 : (tt - t0) / (t1 - t0));
  const a2 = lerp3(p1, p2, t2 === t1 ? 0 : (tt - t1) / (t2 - t1));
  const a3 = lerp3(p2, p3, t3 === t2 ? 0 : (tt - t2) / (t3 - t2));

  const b1 = lerp3(a1, a2, t2 === t0 ? 0 : (tt - t0) / (t2 - t0));
  const b2 = lerp3(a2, a3, t3 === t1 ? 0 : (tt - t1) / (t3 - t1));

  return lerp3(b1, b2, t2 === t1 ? 0 : (tt - t1) / (t2 - t1));
};

const samplePolyline2D = (
  points: Array<[number, number]>,
  count: number,
  closed: boolean
): Array<[number, number]> => {
  if (count <= 0) return [];
  if (points.length === 0) {
    throw new Error("Array layout points must not be empty");
  }
  if (points.length === 1) {
    const first = points[0]!;
    return Array.from({ length: count }, () => point2(first[0], first[1]));
  }

  const segments: Array<{ start: [number, number]; end: [number, number]; length: number }> = [];
  const last = points.length - 1;
  for (let i = 0; i < last; i += 1) {
    const start = points[i]!;
    const end = points[i + 1]!;
    segments.push({ start, end, length: dist2(start, end) });
  }
  if (closed) {
    segments.push({
      start: points[last]!,
      end: points[0]!,
      length: dist2(points[last]!, points[0]!),
    });
  }

  const total = segments.reduce((sum, seg) => sum + seg.length, 0);
  if (total === 0) {
    const first = points[0]!;
    return Array.from({ length: count }, () => point2(first[0], first[1]));
  }

  const step = count <= 1 ? 0 : closed ? total / count : total / (count - 1);
  const result: Array<[number, number]> = [];
  let segIndex = 0;
  let segStart = 0;
  let seg = segments[0]!;
  for (let i = 0; i < count; i += 1) {
    const target = step * i;
    while (segStart + seg.length < target && segIndex < segments.length - 1) {
      segStart += seg.length;
      segIndex += 1;
      seg = segments[segIndex]!;
    }
    const local = seg.length === 0 ? 0 : (target - segStart) / seg.length;
    result.push(lerp2(seg.start, seg.end, local));
  }
  return result;
};

const samplePolyline3D = (
  points: Array<[number, number, number]>,
  count: number,
  closed: boolean
): Array<[number, number, number]> => {
  if (count <= 0) return [];
  if (points.length === 0) {
    throw new Error("Array layout points must not be empty");
  }
  if (points.length === 1) {
    const first = points[0]!;
    return Array.from({ length: count }, () => point3(first[0], first[1], first[2]));
  }

  const segments: Array<{ start: [number, number, number]; end: [number, number, number]; length: number }> = [];
  const last = points.length - 1;
  for (let i = 0; i < last; i += 1) {
    const start = points[i]!;
    const end = points[i + 1]!;
    segments.push({ start, end, length: dist3(start, end) });
  }
  if (closed) {
    segments.push({
      start: points[last]!,
      end: points[0]!,
      length: dist3(points[last]!, points[0]!),
    });
  }

  const total = segments.reduce((sum, seg) => sum + seg.length, 0);
  if (total === 0) {
    const first = points[0]!;
    return Array.from({ length: count }, () => point3(first[0], first[1], first[2]));
  }

  const step = count <= 1 ? 0 : closed ? total / count : total / (count - 1);
  const result: Array<[number, number, number]> = [];
  let segIndex = 0;
  let segStart = 0;
  let seg = segments[0]!;
  for (let i = 0; i < count; i += 1) {
    const target = step * i;
    while (segStart + seg.length < target && segIndex < segments.length - 1) {
      segStart += seg.length;
      segIndex += 1;
      seg = segments[segIndex]!;
    }
    const local = seg.length === 0 ? 0 : (target - segStart) / seg.length;
    result.push(lerp3(seg.start, seg.end, local));
  }
  return result;
};

const buildSplineSamples2D = (
  points: Array<[number, number]>,
  closed: boolean,
  count: number,
  alpha: number
): Array<[number, number]> => {
  const n = points.length;
  const segments = closed ? n : n - 1;
  const stepsPer = Math.max(8, Math.min(64, count * 2));
  const samples: Array<[number, number]> = [];
  for (let i = 0; i < segments; i += 1) {
    const p0 = points[(i - 1 + n) % n] ?? points[0]!;
    const p1 = points[i] ?? points[0]!;
    const p2 = points[(i + 1) % n] ?? points[n - 1]!;
    const p3 = points[(i + 2) % n] ?? points[n - 1]!;
    for (let s = 0; s < stepsPer; s += 1) {
      const t = s / stepsPer;
      samples.push(catmullRom2(p0, p1, p2, p3, t, alpha));
    }
  }
  if (!closed && points.length > 0) {
    samples.push(points[n - 1]!);
  }
  return samples;
};

const buildSplineSamples3D = (
  points: Array<[number, number, number]>,
  closed: boolean,
  count: number,
  alpha: number
): Array<[number, number, number]> => {
  const n = points.length;
  const segments = closed ? n : n - 1;
  const stepsPer = Math.max(8, Math.min(64, count * 2));
  const samples: Array<[number, number, number]> = [];
  for (let i = 0; i < segments; i += 1) {
    const p0 = points[(i - 1 + n) % n] ?? points[0]!;
    const p1 = points[i] ?? points[0]!;
    const p2 = points[(i + 1) % n] ?? points[n - 1]!;
    const p3 = points[(i + 2) % n] ?? points[n - 1]!;
    for (let s = 0; s < stepsPer; s += 1) {
      const t = s / stepsPer;
      samples.push(catmullRom3(p0, p1, p2, p3, t, alpha));
    }
  }
  if (!closed && points.length > 0) {
    samples.push(points[n - 1]!);
  }
  return samples;
};

const computeTangents2D = (
  points: Array<[number, number]>,
  closed: boolean
): Array<[number, number]> => {
  const tangents: Array<[number, number]> = [];
  const count = points.length;
  for (let i = 0; i < count; i += 1) {
    const current = points[i]!;
    const prev = points[i - 1] ?? (closed ? points[count - 1]! : current);
    const next = points[i + 1] ?? (closed ? points[0]! : current);
    tangents.push(normalize2([next[0] - prev[0], next[1] - prev[1]]));
  }
  return tangents;
};

const computeTangents3D = (
  points: Array<[number, number, number]>,
  closed: boolean
): Array<[number, number, number]> => {
  const tangents: Array<[number, number, number]> = [];
  const count = points.length;
  for (let i = 0; i < count; i += 1) {
    const current = points[i]!;
    const prev = points[i - 1] ?? (closed ? points[count - 1]! : current);
    const next = points[i + 1] ?? (closed ? points[0]! : current);
    tangents.push(
      normalize3([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]])
    );
  }
  return tangents;
};

/** Generate a 2D grid of sketch entities or sketch profiles. */
export const sketchArray = <T extends SketchEntity | SketchProfile>(
  layout: SketchArrayLayout,
  make: (item: SketchArrayItem) => T | T[]
): T[] => {
  const origin: Point2D = layout.origin ?? [0, 0];
  const order = layout.order ?? "row-major";
  return buildArray2D(layout.count, order, (row, col, index) => {
    const offset: Point2D = [
      addScalar(origin[0], mulScalar(layout.spacing[0], col)),
      addScalar(origin[1], mulScalar(layout.spacing[1], row)),
    ];
    return make({ index, row, col, offset });
  });
};

/** Generate a 2D grid of features (constant Z from origin). */
export const featureArray = <T extends IntentFeature>(
  layout: FeatureArrayLayout,
  make: (item: FeatureArrayItem) => T | T[]
): T[] => {
  const origin: Point3D = layout.origin ?? [0, 0, 0];
  const order = layout.order ?? "row-major";
  return buildArray2D(layout.count, order, (row, col, index) => {
    const offset: Point3D = [
      addScalar(origin[0], mulScalar(layout.spacing[0], col)),
      addScalar(origin[1], mulScalar(layout.spacing[1], row)),
      origin[2],
    ];
    return make({ index, row, col, offset });
  });
};

/** Generate a circular array of sketch entities or sketch profiles. */
export const sketchCircularArray = <T extends SketchEntity | SketchProfile>(
  layout: CircularArrayLayout2D,
  make: (item: CircularArrayItem2D) => T | T[]
): T[] => {
  const count = layout.count;
  ensureCount(count, "count");
  if (count === 0) return [];
  ensureFiniteNumber(layout.radius, "radius");
  const center = layout.center ?? [0, 0];
  const units = layout.units ?? "deg";
  const start = toRadians(layout.startAngle ?? 0, units);
  let sweep = resolveSweep(start, { endAngle: layout.endAngle, sweep: layout.sweep, units });
  sweep = normalizeDirection(sweep, layout.direction);
  const step = sweepStep(count, sweep);
  const result: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = start + step * i;
    const x = center[0] + layout.radius * Math.cos(angle);
    const y = center[1] + layout.radius * Math.sin(angle);
    pushResult(result, make({ index: i, angle, offset: [x, y] }));
  }
  return result;
};

/** Generate a circular array of features (constant Z from center). */
export const featureCircularArray = <T extends IntentFeature>(
  layout: CircularArrayLayout3D,
  make: (item: CircularArrayItem3D) => T | T[]
): T[] => {
  const count = layout.count;
  ensureCount(count, "count");
  if (count === 0) return [];
  ensureFiniteNumber(layout.radius, "radius");
  const center = layout.center ?? [0, 0, 0];
  const units = layout.units ?? "deg";
  const start = toRadians(layout.startAngle ?? 0, units);
  let sweep = resolveSweep(start, { endAngle: layout.endAngle, sweep: layout.sweep, units });
  sweep = normalizeDirection(sweep, layout.direction);
  const step = sweepStep(count, sweep);
  const result: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = start + step * i;
    const x = center[0] + layout.radius * Math.cos(angle);
    const y = center[1] + layout.radius * Math.sin(angle);
    const z = center[2];
    pushResult(result, make({ index: i, angle, offset: [x, y, z] }));
  }
  return result;
};

/** Generate a radial array (angle + radius grid) of sketch entities or sketch profiles. */
export const sketchRadialArray = <T extends SketchEntity | SketchProfile>(
  layout: RadialArrayLayout2D,
  make: (item: RadialArrayItem2D) => T | T[]
): T[] => {
  const [angleCount, radiusCount] = layout.count;
  ensureCount(angleCount, "count[0]");
  ensureCount(radiusCount, "count[1]");
  if (angleCount === 0 || radiusCount === 0) return [];
  const units = layout.units ?? "deg";
  const center = layout.center ?? [0, 0];
  const start = toRadians(layout.startAngle ?? 0, units);
  let sweep = layout.sweep !== undefined ? toRadians(layout.sweep, units) : Math.PI * 2;
  sweep = normalizeDirection(sweep, layout.direction);
  const angleStep =
    layout.angleStep !== undefined
      ? toRadians(layout.angleStep, units)
      : sweepStep(angleCount, sweep);
  const radiusStart = layout.radiusStart ?? 0;
  ensureFiniteNumber(layout.radiusStep, "radiusStep");
  const order = layout.order ?? "row-major";
  return buildArray2D(layout.count, order, (row, col, index) => {
    const radius = radiusStart + layout.radiusStep * row;
    const angle = start + angleStep * col;
    const x = center[0] + radius * Math.cos(angle);
    const y = center[1] + radius * Math.sin(angle);
    return make({ index, row, col, radius, angle, offset: [x, y] });
  });
};

/** Generate a radial array (angle + radius grid) of features (constant Z from center). */
export const featureRadialArray = <T extends IntentFeature>(
  layout: RadialArrayLayout3D,
  make: (item: RadialArrayItem3D) => T | T[]
): T[] => {
  const [angleCount, radiusCount] = layout.count;
  ensureCount(angleCount, "count[0]");
  ensureCount(radiusCount, "count[1]");
  if (angleCount === 0 || radiusCount === 0) return [];
  const units = layout.units ?? "deg";
  const center = layout.center ?? [0, 0, 0];
  const start = toRadians(layout.startAngle ?? 0, units);
  let sweep = layout.sweep !== undefined ? toRadians(layout.sweep, units) : Math.PI * 2;
  sweep = normalizeDirection(sweep, layout.direction);
  const angleStep =
    layout.angleStep !== undefined
      ? toRadians(layout.angleStep, units)
      : sweepStep(angleCount, sweep);
  const radiusStart = layout.radiusStart ?? 0;
  ensureFiniteNumber(layout.radiusStep, "radiusStep");
  const order = layout.order ?? "row-major";
  return buildArray2D(layout.count, order, (row, col, index) => {
    const radius = radiusStart + layout.radiusStep * row;
    const angle = start + angleStep * col;
    const x = center[0] + radius * Math.cos(angle);
    const y = center[1] + radius * Math.sin(angle);
    const z = center[2];
    return make({ index, row, col, radius, angle, offset: [x, y, z] });
  });
};

/** Generate an array of sketch entities or sketch profiles along a spline/polyline. */
export const sketchArrayAlongSpline = <T extends SketchEntity | SketchProfile>(
  layout: SplineArrayLayout2D,
  make: (item: SplineArrayItem2D) => T | T[]
): T[] => {
  const count = layout.count;
  ensureCount(count, "count");
  if (count === 0) return [];
  const closed = layout.closed ?? false;
  const mode = layout.mode ?? "spline";
  const alpha = layout.tension ?? 0.5;
  const points = layout.points;
  if (points.length < 2) {
    throw new Error("Array layout points must include at least two points");
  }

  const samples =
    mode === "polyline"
      ? points
      : buildSplineSamples2D(points, closed, count, alpha);
  const offsets = samplePolyline2D(samples, count, closed);
  const tangents = computeTangents2D(offsets, closed);

  const result: T[] = [];
  for (let i = 0; i < offsets.length; i += 1) {
    const t = offsets.length <= 1 ? 0 : closed ? i / offsets.length : i / (offsets.length - 1);
    const offset = offsets[i]!;
    const tangent = tangents[i]!;
    pushResult(result, make({ index: i, t, offset, tangent }));
  }
  return result;
};

/** Generate an array of features along a spline/polyline (constant Z from path). */
export const featureArrayAlongSpline = <T extends IntentFeature>(
  layout: SplineArrayLayout3D,
  make: (item: SplineArrayItem3D) => T | T[]
): T[] => {
  const count = layout.count;
  ensureCount(count, "count");
  if (count === 0) return [];
  const closed = layout.closed ?? false;
  const mode = layout.mode ?? "spline";
  const alpha = layout.tension ?? 0.5;
  const points = layout.points;
  if (points.length < 2) {
    throw new Error("Array layout points must include at least two points");
  }

  const samples =
    mode === "polyline"
      ? points
      : buildSplineSamples3D(points, closed, count, alpha);
  const offsets = samplePolyline3D(samples, count, closed);
  const tangents = computeTangents3D(offsets, closed);

  const result: T[] = [];
  for (let i = 0; i < offsets.length; i += 1) {
    const t = offsets.length <= 1 ? 0 : closed ? i / offsets.length : i / (offsets.length - 1);
    const offset = offsets[i]!;
    const tangent = tangents[i]!;
    pushResult(result, make({ index: i, t, offset, tangent }));
  }
  return result;
};
