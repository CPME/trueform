import type { SketchEntity } from "../dsl.js";

export type SketchDxfOptions = {
  unit?: "mm" | "cm" | "m" | "in";
  layer?: string;
  constructionLayer?: string;
};

export function buildSketchDxf(
  entitiesInput: SketchEntity[] | Array<Record<string, unknown>>,
  opts: SketchDxfOptions = {}
): string {
  const entities = Array.isArray(entitiesInput) ? (entitiesInput as SketchEntity[]) : [];
  const layer = opts.layer ?? "SKETCH";
  const constructionLayer = opts.constructionLayer ?? "CONSTRUCTION";

  const lines: string[] = [];
  lines.push("0", "SECTION", "2", "HEADER");
  lines.push("9", "$ACADVER", "1", "AC1015");
  const insUnits = dxfInsUnits(opts.unit ?? "mm");
  if (insUnits !== null) {
    lines.push("9", "$INSUNITS", "70", String(insUnits));
  }
  lines.push("0", "ENDSEC");
  lines.push("0", "SECTION", "2", "ENTITIES");

  for (const entity of entities) {
    const entityLayer = entity.construction ? constructionLayer : layer;
    switch (entity.kind) {
      case "sketch.point": {
        const p = asVec2((entity as any).point);
        pushEntity(lines, "POINT", entityLayer, [
          ["10", formatNum(p[0])],
          ["20", formatNum(p[1])],
          ["30", "0"],
        ]);
        break;
      }
      case "sketch.line": {
        const start = asVec2((entity as any).start);
        const end = asVec2((entity as any).end);
        pushEntity(lines, "LINE", entityLayer, [
          ["10", formatNum(start[0])],
          ["20", formatNum(start[1])],
          ["30", "0"],
          ["11", formatNum(end[0])],
          ["21", formatNum(end[1])],
          ["31", "0"],
        ]);
        break;
      }
      case "sketch.arc": {
        const center = asVec2((entity as any).center);
        const start = asVec2((entity as any).start);
        const end = asVec2((entity as any).end);
        const direction = (entity as any).direction === "cw" ? "cw" : "ccw";
        const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
        let startAngle = normalizeAngle((Math.atan2(start[1] - center[1], start[0] - center[0]) * 180) / Math.PI);
        let endAngle = normalizeAngle((Math.atan2(end[1] - center[1], end[0] - center[0]) * 180) / Math.PI);
        if (direction === "cw") {
          const tmp = startAngle;
          startAngle = endAngle;
          endAngle = tmp;
        }
        pushEntity(lines, "ARC", entityLayer, [
          ["10", formatNum(center[0])],
          ["20", formatNum(center[1])],
          ["30", "0"],
          ["40", formatNum(radius)],
          ["50", formatNum(startAngle)],
          ["51", formatNum(endAngle)],
        ]);
        break;
      }
      case "sketch.circle": {
        const center = asVec2((entity as any).center);
        const radius = num((entity as any).radius);
        pushEntity(lines, "CIRCLE", entityLayer, [
          ["10", formatNum(center[0])],
          ["20", formatNum(center[1])],
          ["30", "0"],
          ["40", formatNum(radius)],
        ]);
        break;
      }
      default: {
        const poly = polylineForEntity(entity as any);
        if (!poly || poly.points.length === 0) break;
        pushEntity(lines, "LWPOLYLINE", entityLayer, [
          ["90", String(poly.points.length)],
          ["70", poly.closed ? "1" : "0"],
          ...poly.points.flatMap(
            (point): [string, string][] => [
              ["10", formatNum(point[0])],
              ["20", formatNum(point[1])],
            ]
          ),
        ]);
        break;
      }
    }
  }

  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n");
}

function pushEntity(lines: string[], type: string, layer: string, pairs: Array<[string, string]>): void {
  lines.push("0", type, "8", layer);
  for (const [code, value] of pairs) {
    lines.push(code, value);
  }
}

function dxfInsUnits(unit: "mm" | "cm" | "m" | "in"): number | null {
  switch (unit) {
    case "mm":
      return 4;
    case "cm":
      return 5;
    case "m":
      return 6;
    case "in":
      return 1;
    default:
      return null;
  }
}

function normalizeAngle(deg: number): number {
  let out = deg % 360;
  if (out < 0) out += 360;
  return out;
}

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(6).replace(/\.0+$/, "").replace(/(\.\d+?)0+$/, "$1");
}

function num(value: any): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && typeof value.value === "number") {
    return value.value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asVec2(input: any): [number, number] {
  if (!Array.isArray(input)) return [0, 0];
  return [num(input[0]), num(input[1])];
}

function clampCount(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

function rotatePoint(point: [number, number], angle: number): [number, number] {
  if (!angle) return point;
  const [x, y] = point;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c];
}

function addPoint(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] + b[0], a[1] + b[1]];
}

function sampleArc(
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
  if (!Number.isFinite(radius) || radius <= 0) {
    return [start, end];
  }
  const startAngle = Math.atan2(sy, sx);
  const endAngle = Math.atan2(ey, ex);
  let sweep = endAngle - startAngle;
  if (direction === "ccw") {
    if (sweep <= 0) sweep += Math.PI * 2;
  } else {
    if (sweep >= 0) sweep -= Math.PI * 2;
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

function sampleEllipse(
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
    const rotated = rotatePoint(local, rotation);
    points.push(addPoint(rotated, center));
  }
  return points;
}

function rectanglePoints(entity: any): [number, number][] {
  const rotation = num(entity.rotation ?? 0);
  const center = entity.mode === "center" ? asVec2(entity.center) : null;
  if (center) {
    const hw = num(entity.width) / 2;
    const hh = num(entity.height) / 2;
    const points: [number, number][] = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    return points.map((point) => addPoint(rotatePoint(point, rotation), center));
  }
  const width = num(entity.width);
  const height = num(entity.height);
  const corner = asVec2(entity.corner);
  const points: [number, number][] = [
    [corner[0], corner[1]],
    [corner[0] + width, corner[1]],
    [corner[0] + width, corner[1] + height],
    [corner[0], corner[1] + height],
  ];
  if (rotation) {
    const center2: [number, number] = [corner[0] + width / 2, corner[1] + height / 2];
    return points.map((point) => addPoint(rotatePoint([point[0] - center2[0], point[1] - center2[1]], rotation), center2));
  }
  return points;
}

function slotPoints(entity: any): [number, number][] {
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
  points.push([leftCenter[0], top]);
  const leftArc = sampleArc(leftCenter, [leftCenter[0], top], [leftCenter[0], bottom], "ccw");
  leftArc.shift();
  points.push(...leftArc);
  points.push([halfStraight, bottom]);
  const rightArc = sampleArc(rightCenter, [rightCenter[0], bottom], [rightCenter[0], top], "ccw");
  rightArc.shift();
  points.push(...rightArc);

  return points.map((point) => addPoint(rotatePoint(point, rotation), center));
}

function polygonPoints(entity: any): [number, number][] {
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

function polylineForEntity(entity: SketchEntity): { points: [number, number][]; closed: boolean } | null {
  switch (entity.kind) {
    case "sketch.line":
      return { points: [asVec2((entity as any).start), asVec2((entity as any).end)], closed: false };
    case "sketch.arc":
      return {
        points: sampleArc(
          asVec2((entity as any).center),
          asVec2((entity as any).start),
          asVec2((entity as any).end),
          (entity as any).direction === "cw" ? "cw" : "ccw"
        ),
        closed: false,
      };
    case "sketch.circle":
      return {
        points: sampleEllipse(asVec2((entity as any).center), num((entity as any).radius), num((entity as any).radius), 0, 72),
        closed: true,
      };
    case "sketch.ellipse":
      return {
        points: sampleEllipse(
          asVec2((entity as any).center),
          num((entity as any).radiusX),
          num((entity as any).radiusY),
          num((entity as any).rotation ?? 0),
          72
        ),
        closed: true,
      };
    case "sketch.rectangle":
      return { points: rectanglePoints(entity as any), closed: true };
    case "sketch.slot":
      return { points: slotPoints(entity as any), closed: true };
    case "sketch.polygon":
      return { points: polygonPoints(entity as any), closed: true };
    case "sketch.spline":
      return { points: (entity as any).points.map(asVec2), closed: Boolean((entity as any).closed) };
    default:
      return null;
  }
}
