import type { SketchEntity } from "../dsl.js";

export type SketchSvgTheme = {
  background?: string | null;
  stroke: string;
  constructionStroke: string;
  pointStroke: string;
  pointFill: string;
};

export type SketchSvgOptions = {
  width?: number;
  height?: number;
  padRatio?: number;
  theme?: SketchSvgTheme;
};

const DEFAULT_THEME: SketchSvgTheme = {
  background: "#f8f7f2",
  stroke: "#14120f",
  constructionStroke: "#7d6f63",
  pointStroke: "#14120f",
  pointFill: "#14120f",
};

export function buildSketchSvg(
  entitiesInput: SketchEntity[] | Array<Record<string, unknown>>,
  opts: SketchSvgOptions = {}
): string {
  const entities = Array.isArray(entitiesInput) ? entitiesInput : [];
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  const theme = { ...DEFAULT_THEME, ...opts.theme };

  const mainPaths: string[] = [];
  const constructionPaths: string[] = [];
  const pointMarkers: Array<{ center: [number, number]; radius: number; construction: boolean }> = [];

  for (const entity of entities as any[]) {
    if (entity.kind === "sketch.point") {
      const radius = 1;
      const point = asVec2(entity.point);
      updateBounds(bounds, [point[0] - radius, point[1] - radius]);
      updateBounds(bounds, [point[0] + radius, point[1] + radius]);
      pointMarkers.push({
        center: point,
        radius,
        construction: Boolean(entity.construction),
      });
      continue;
    }
    const poly = polylineForEntity(entity);
    if (!poly) continue;
    for (const point of poly.points) updateBounds(bounds, point);
    const path = polylineToPath(poly.points, poly.closed);
    if (!path) continue;
    if (entity.construction) {
      constructionPaths.push(path);
    } else {
      mainPaths.push(path);
    }
  }

  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY)) {
    throw new Error("Sketch SVG: no drawable entities found");
  }

  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const pad = Math.max(width, height) * (opts.padRatio ?? 0.1);
  const viewBox = `${formatNum(bounds.minX - pad)} ${formatNum(bounds.minY - pad)} ${formatNum(
    width + pad * 2
  )} ${formatNum(height + pad * 2)}`;
  const strokeWidth = Math.max(0.2, Math.max(width, height) / 600);
  const svgWidth = Math.round(opts.width ?? 900);
  const svgHeight = Math.round(opts.height ?? 700);

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${svgWidth}" height="${svgHeight}">`
  );

  if (theme.background) {
    lines.push(
      `<rect x="${formatNum(bounds.minX - pad)}" y="${formatNum(bounds.minY - pad)}" width="${formatNum(
        width + pad * 2
      )}" height="${formatNum(height + pad * 2)}" fill="${theme.background}" />`
    );
  }

  if (mainPaths.length > 0) {
    lines.push(
      `<path d="${mainPaths.join(" ")}" fill="none" stroke="${theme.stroke}" stroke-width="${formatNum(
        strokeWidth
      )}" vector-effect="non-scaling-stroke" />`
    );
  }
  if (constructionPaths.length > 0) {
    lines.push(
      `<path d="${constructionPaths.join(
        " "
      )}" fill="none" stroke="${theme.constructionStroke}" stroke-width="${formatNum(
        strokeWidth
      )}" stroke-dasharray="${formatNum(strokeWidth * 4)} ${formatNum(
        strokeWidth * 4
      )}" vector-effect="non-scaling-stroke" />`
    );
  }

  for (const marker of pointMarkers) {
    const [x, y] = toSvgPoint(marker.center);
    const stroke = marker.construction ? theme.constructionStroke : theme.pointStroke;
    const fill = marker.construction ? theme.constructionStroke : theme.pointFill;
    lines.push(
      `<circle cx="${formatNum(x)}" cy="${formatNum(y)}" r="${formatNum(
        marker.radius
      )}" fill="${fill}" stroke="${stroke}" />`
    );
  }

  lines.push("</svg>");
  return lines.join("\n");
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

function toSvgPoint(point: [number, number]): [number, number] {
  return [point[0], -point[1]];
}

function formatNum(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : "0";
}

function updateBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  point: [number, number]
): void {
  const [x, y] = toSvgPoint(point);
  if (x < bounds.minX) bounds.minX = x;
  if (y < bounds.minY) bounds.minY = y;
  if (x > bounds.maxX) bounds.maxX = x;
  if (y > bounds.maxY) bounds.maxY = y;
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
  if (entity.mode === "center") {
    const center = asVec2(entity.center);
    const cx = center[0];
    const cy = center[1];
    const hw = num(entity.width) / 2;
    const hh = num(entity.height) / 2;
    const corners: [number, number][] = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    return corners.map((point) => addPoint(rotatePoint(point, rotation), [cx, cy]));
  }
  const origin = asVec2(entity.corner);
  const w = num(entity.width);
  const h = num(entity.height);
  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  return corners.map((point) => addPoint(rotatePoint(point, rotation), origin));
}

function polygonPoints(entity: any): [number, number][] {
  const sides = Math.max(3, clampCount(num(entity.sides), 3));
  const rotation = num(entity.rotation ?? 0);
  const center = asVec2(entity.center);
  const radius = num(entity.radius);
  const points: [number, number][] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    points.push([
      center[0] + radius * Math.cos(angle),
      center[1] + radius * Math.sin(angle),
    ]);
  }
  return points;
}

function slotPoints(entity: any): [number, number][] {
  const rotation = num(entity.rotation ?? 0);
  const length = num(entity.length);
  const width = num(entity.width);
  const center = asVec2(entity.center);
  const radius = width / 2;
  const straight = Math.max(0, length - 2 * radius);
  const halfStraight = straight / 2;
  const top = radius;
  const bottom = -radius;
  const leftCenter: [number, number] = [-halfStraight, 0];
  const rightCenter: [number, number] = [halfStraight, 0];

  const points: [number, number][] = [];
  points.push([halfStraight, top], [-halfStraight, top]);

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

function polylineForEntity(entity: SketchEntity): { points: [number, number][]; closed: boolean } | null {
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
      return { points: rectanglePoints(entity), closed: true };
    case "sketch.slot":
      return { points: slotPoints(entity), closed: true };
    case "sketch.polygon":
      return { points: polygonPoints(entity), closed: true };
    case "sketch.spline":
      return { points: entity.points.map(asVec2), closed: Boolean(entity.closed) };
    default:
      return null;
  }
}

function polylineToPath(points: [number, number][], closed: boolean): string {
  if (!points || points.length === 0) return "";
  const start = toSvgPoint(points[0] ?? [0, 0]);
  let d = `M${formatNum(start[0])} ${formatNum(start[1])}`;
  for (let i = 1; i < points.length; i += 1) {
    const point = toSvgPoint(points[i] ?? [0, 0]);
    d += ` L${formatNum(point[0])} ${formatNum(point[1])}`;
  }
  if (closed) d += " Z";
  return d;
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
