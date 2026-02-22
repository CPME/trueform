import type {
  Point2D,
  SketchEntity,
  SketchPolygon,
  SketchRectangle,
  SketchSlot,
} from "../ir.js";

export type SketchPolylineOptions = {
  cornerRotationPivot?: "origin" | "center";
  slotStart?: "left" | "right";
  splineMode?: "control-points" | "catmull-rom";
  splineSteps?: number;
};

export function polylineForEntity(
  entity: SketchEntity,
  options: SketchPolylineOptions = {}
): { points: [number, number][]; closed: boolean } | null {
  switch (entity.kind) {
    case "sketch.line":
      return { points: [asVec2(entity.start), asVec2(entity.end)], closed: false };
    case "sketch.arc":
      return {
        points: sampleArc(
          asVec2(entity.center),
          asVec2(entity.start),
          asVec2(entity.end),
          entity.direction
        ),
        closed: false,
      };
    case "sketch.circle":
      return {
        points: sampleEllipse(
          asVec2(entity.center),
          num(entity.radius),
          num(entity.radius),
          0,
          72
        ),
        closed: true,
      };
    case "sketch.ellipse":
      return {
        points: sampleEllipse(
          asVec2(entity.center),
          num(entity.radiusX),
          num(entity.radiusY),
          num(entity.rotation ?? 0),
          72
        ),
        closed: true,
      };
    case "sketch.rectangle":
      return {
        points: rectanglePoints(
          entity,
          options.cornerRotationPivot ?? "origin"
        ),
        closed: true,
      };
    case "sketch.slot":
      return {
        points: slotPoints(entity, options.slotStart ?? "right"),
        closed: true,
      };
    case "sketch.polygon":
      return { points: polygonPoints(entity), closed: true };
    case "sketch.spline":
      if (options.splineMode === "catmull-rom") {
        return {
          points: sampleSpline(
            entity.points.map(asVec2),
            Boolean(entity.closed),
            Math.max(1, Math.round(options.splineSteps ?? 24))
          ),
          closed: Boolean(entity.closed),
        };
      }
      return {
        points: entity.points.map(asVec2),
        closed: Boolean(entity.closed),
      };
    default:
      return null;
  }
}

export function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { value?: unknown }).value === "number"
  ) {
    return (value as { value: number }).value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function asVec2(input: unknown): [number, number] {
  if (!Array.isArray(input)) return [0, 0];
  return [num(input[0]), num(input[1])];
}

export function clampCount(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

export function rotatePoint(point: [number, number], angle: number): [number, number] {
  if (!angle) return point;
  const [x, y] = point;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c];
}

export function addPoint(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] + b[0], a[1] + b[1]];
}

export function sampleArc(
  center: [number, number],
  start: [number, number],
  end: [number, number],
  direction: "cw" | "ccw"
): [number, number][] {
  const cx = center[0];
  const cy = center[1];
  const sx = start[0] - cx;
  const sy = start[1] - cy;
  const ex = end[0] - cx;
  const ey = end[1] - cy;
  const radius = Math.hypot(sx, sy);
  if (!Number.isFinite(radius) || radius <= 0) return [start, end];

  const startAngle = Math.atan2(sy, sx);
  const endAngle = Math.atan2(ey, ex);
  let sweep = endAngle - startAngle;
  if (direction === "ccw") {
    if (sweep <= 0) sweep += Math.PI * 2;
  } else if (sweep >= 0) {
    sweep -= Math.PI * 2;
  }

  const steps = Math.max(6, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = startAngle + sweep * t;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

export function sampleEllipse(
  center: [number, number],
  rx: number,
  ry: number,
  rotation = 0,
  segments = 64
): [number, number][] {
  const steps = Math.max(8, segments);
  const points: [number, number][] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const local: [number, number] = [rx * Math.cos(t), ry * Math.sin(t)];
    points.push(addPoint(rotatePoint(local, rotation), center));
  }
  return points;
}

function rectanglePoints(
  entity: SketchRectangle,
  cornerRotationPivot: "origin" | "center"
): [number, number][] {
  const rotation = num(entity.rotation ?? 0);
  if (entity.mode === "center") {
    const center = asVec2(entity.center);
    const hw = num(entity.width) / 2;
    const hh = num(entity.height) / 2;
    const corners: [number, number][] = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    return corners.map((point) => addPoint(rotatePoint(point, rotation), center));
  }

  const corner = asVec2(entity.corner);
  const width = num(entity.width);
  const height = num(entity.height);
  const corners: [number, number][] = [
    [corner[0], corner[1]],
    [corner[0] + width, corner[1]],
    [corner[0] + width, corner[1] + height],
    [corner[0], corner[1] + height],
  ];

  if (!rotation) return corners;
  if (cornerRotationPivot === "center") {
    const center: [number, number] = [corner[0] + width / 2, corner[1] + height / 2];
    return corners.map((point) =>
      addPoint(
        rotatePoint([point[0] - center[0], point[1] - center[1]], rotation),
        center
      )
    );
  }
  return corners.map((point) =>
    addPoint(
      rotatePoint([point[0] - corner[0], point[1] - corner[1]], rotation),
      corner
    )
  );
}

function slotPoints(entity: SketchSlot, slotStart: "left" | "right"): [number, number][] {
  const length = num(entity.length);
  const width = num(entity.width);
  if (length <= 0 || width <= 0) return [];

  const rotation = num(entity.rotation ?? 0);
  const center = asVec2(entity.center ?? [0, 0]);
  const halfStraight = Math.max(0, length / 2 - width / 2);
  const radius = width / 2;
  const leftCenter: [number, number] = [-halfStraight, 0];
  const rightCenter: [number, number] = [halfStraight, 0];
  const top = radius;
  const bottom = -radius;

  const points: [number, number][] = [];
  if (slotStart === "right") points.push([halfStraight, top], [-halfStraight, top]);
  else points.push([leftCenter[0], top]);

  const leftArc = sampleArc(
    leftCenter,
    [leftCenter[0], top],
    [leftCenter[0], bottom],
    "ccw"
  );
  leftArc.shift();
  points.push(...leftArc);

  points.push([halfStraight, bottom]);
  const rightArc = sampleArc(
    rightCenter,
    [rightCenter[0], bottom],
    [rightCenter[0], top],
    "ccw"
  );
  rightArc.shift();
  points.push(...rightArc);

  return points.map((point) => addPoint(rotatePoint(point, rotation), center));
}

function polygonPoints(entity: SketchPolygon): [number, number][] {
  const sides = clampCount(num(entity.sides), 3);
  const radius = num(entity.radius);
  const rotation = num(entity.rotation ?? 0);
  const center = asVec2(entity.center);
  const points: [number, number][] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2 + rotation;
    points.push([center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)]);
  }
  return points;
}

function sampleSpline(
  points: [number, number][],
  closed: boolean,
  steps: number
): [number, number][] {
  if (!points || points.length < 2) return points ?? [];
  const result: [number, number][] = [];
  const count = points.length;
  const segmentCount = closed ? count : count - 1;
  const clampIndex = (i: number) => {
    if (closed) return (i + count) % count;
    return Math.max(0, Math.min(count - 1, i));
  };

  for (let i = 0; i < segmentCount; i += 1) {
    const p0 = points[clampIndex(i - 1)] ?? [0, 0];
    const p1 = points[clampIndex(i)] ?? [0, 0];
    const p2 = points[clampIndex(i + 1)] ?? [0, 0];
    const p3 = points[clampIndex(i + 2)] ?? [0, 0];
    for (let s = 0; s < steps; s += 1) {
      const t = steps === 0 ? 0 : s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      result.push([x, y]);
    }
  }
  if (!closed) result.push(points[count - 1] ?? [0, 0]);
  return result;
}
