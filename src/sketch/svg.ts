import type { SketchEntity } from "../ir.js";
import { asVec2, polylineForEntity } from "./polyline.js";

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
  const entities = Array.isArray(entitiesInput) ? (entitiesInput as SketchEntity[]) : [];
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

  for (const entity of entities) {
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
    const poly = polylineForEntity(entity, {
      cornerRotationPivot: "origin",
      slotStart: "right",
      splineMode: "catmull-rom",
      splineSteps: 24,
    });
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
