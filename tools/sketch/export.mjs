import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePart } from "../../dist/compiler.js";
import { sketchPrimitivesPart } from "../../dist/examples/sketch_primitives.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "assets");
const outPath = path.join(outDir, "sketch_primitives.svg");

const part = sketchPrimitivesPart;
const normalized = normalizePart(part);
const sketch = normalized.features.find((f) => f.kind === "feature.sketch2d");

if (!sketch) {
  throw new Error("Sketch export: no sketch2d feature found");
}

const entities = sketch.entities ?? [];

function clampCount(value, fallback = 1) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
}

function rotatePoint(point, angle) {
  if (!angle) return point;
  const [x, y] = point;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c];
}

function addPoint(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}

function toSvgPoint(point) {
  return [point[0], -point[1]];
}

function formatNum(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "0";
}

function updateBounds(bounds, point) {
  const [x, y] = toSvgPoint(point);
  if (x < bounds.minX) bounds.minX = x;
  if (y < bounds.minY) bounds.minY = y;
  if (x > bounds.maxX) bounds.maxX = x;
  if (y > bounds.maxY) bounds.maxY = y;
}

function sampleArc(center, start, end, direction) {
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
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = startAngle + sweep * t;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

function sampleEllipse(center, rx, ry, rotation = 0, segments = 64) {
  const steps = Math.max(8, segments);
  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const local = [rx * Math.cos(t), ry * Math.sin(t)];
    const rotated = rotatePoint(local, rotation);
    points.push(addPoint(rotated, center));
  }
  return points;
}

function rectanglePoints(entity) {
  const rotation = entity.rotation ?? 0;
  if (entity.mode === "center") {
    const cx = entity.center[0];
    const cy = entity.center[1];
    const hw = entity.width / 2;
    const hh = entity.height / 2;
    const corners = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    return corners.map((point) => addPoint(rotatePoint(point, rotation), [cx, cy]));
  }
  const origin = entity.corner;
  const w = entity.width;
  const h = entity.height;
  const corners = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  return corners.map((point) => addPoint(rotatePoint(point, rotation), origin));
}

function polygonPoints(entity) {
  const sides = Math.max(3, clampCount(entity.sides, 3));
  const rotation = entity.rotation ?? 0;
  const points = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    points.push([
      entity.center[0] + entity.radius * Math.cos(angle),
      entity.center[1] + entity.radius * Math.sin(angle),
    ]);
  }
  return points;
}

function slotPoints(entity) {
  const rotation = entity.rotation ?? 0;
  const length = entity.length;
  const width = entity.width;
  const radius = width / 2;
  const straight = Math.max(0, length - 2 * radius);
  const halfStraight = straight / 2;
  const top = radius;
  const bottom = -radius;
  const leftCenter = [-halfStraight, 0];
  const rightCenter = [halfStraight, 0];

  const points = [];
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

  const rotated = points.map((point) =>
    addPoint(rotatePoint(point, rotation), entity.center)
  );
  return rotated;
}

function polylineForEntity(entity) {
  switch (entity.kind) {
    case "sketch.line":
      return { points: [entity.start, entity.end], closed: false };
    case "sketch.arc":
      return {
        points: sampleArc(entity.center, entity.start, entity.end, entity.direction),
        closed: false,
      };
    case "sketch.circle":
      return {
        points: sampleEllipse(entity.center, entity.radius, entity.radius, 0, 72),
        closed: true,
      };
    case "sketch.ellipse":
      return {
        points: sampleEllipse(
          entity.center,
          entity.radiusX,
          entity.radiusY,
          entity.rotation ?? 0,
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
      return { points: entity.points, closed: Boolean(entity.closed) };
    default:
      return null;
  }
}

function polylineToPath(points, closed) {
  if (!points || points.length === 0) return "";
  const start = toSvgPoint(points[0]);
  let d = `M${formatNum(start[0])} ${formatNum(start[1])}`;
  for (let i = 1; i < points.length; i += 1) {
    const point = toSvgPoint(points[i]);
    d += ` L${formatNum(point[0])} ${formatNum(point[1])}`;
  }
  if (closed) d += " Z";
  return d;
}

function buildSvg(entitiesInput) {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  const mainPaths = [];
  const constructionPaths = [];
  const pointMarkers = [];

  for (const entity of entitiesInput) {
    if (entity.kind === "sketch.point") {
      const radius = 1;
      updateBounds(bounds, [entity.point[0] - radius, entity.point[1] - radius]);
      updateBounds(bounds, [entity.point[0] + radius, entity.point[1] + radius]);
      pointMarkers.push({
        center: entity.point,
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
    throw new Error("Sketch export: no drawable entities found");
  }

  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const pad = Math.max(width, height) * 0.1;
  const viewBox = `${formatNum(bounds.minX - pad)} ${formatNum(bounds.minY - pad)} ${formatNum(
    width + pad * 2
  )} ${formatNum(height + pad * 2)}`;
  const strokeWidth = Math.max(0.2, Math.max(width, height) / 600);

  const lines = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="900" height="700">`);
  lines.push(
    `<rect x="${formatNum(bounds.minX - pad)}" y="${formatNum(bounds.minY - pad)}" width="${formatNum(
      width + pad * 2
    )}" height="${formatNum(height + pad * 2)}" fill="#f8f7f2" />`
  );

  if (mainPaths.length > 0) {
    lines.push(
      `<path d="${mainPaths.join(" ")}" fill="none" stroke="#14120f" stroke-width="${formatNum(
        strokeWidth
      )}" vector-effect="non-scaling-stroke" />`
    );
  }
  if (constructionPaths.length > 0) {
    lines.push(
      `<path d="${constructionPaths.join(
        " "
      )}" fill="none" stroke="#7d6f63" stroke-width="${formatNum(
        strokeWidth
      )}" stroke-dasharray="${formatNum(strokeWidth * 4)} ${formatNum(
        strokeWidth * 4
      )}" vector-effect="non-scaling-stroke" />`
    );
  }

  for (const marker of pointMarkers) {
    const [x, y] = toSvgPoint(marker.center);
    const stroke = marker.construction ? "#7d6f63" : "#14120f";
    const fill = marker.construction ? "#7d6f63" : "#14120f";
    lines.push(
      `<circle cx="${formatNum(x)}" cy="${formatNum(y)}" r="${formatNum(
        marker.radius
      )}" fill="${fill}" stroke="${stroke}" />`
    );
  }

  lines.push("</svg>");
  return lines.join("\n");
}

const svg = buildSvg(entities);
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(outPath, svg);
console.log(JSON.stringify({ output: outPath, entities: entities.length }, null, 2));
