import type { SketchEntity } from "../ir.js";
import { asVec2, num, polylineForEntity } from "./polyline.js";

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
        const p = asVec2(entity.point);
        pushEntity(lines, "POINT", entityLayer, [
          ["10", formatNum(p[0])],
          ["20", formatNum(p[1])],
          ["30", "0"],
        ]);
        break;
      }
      case "sketch.line": {
        const start = asVec2(entity.start);
        const end = asVec2(entity.end);
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
        const center = asVec2(entity.center);
        const start = asVec2(entity.start);
        const end = asVec2(entity.end);
        const direction = entity.direction;
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
        const center = asVec2(entity.center);
        const radius = num(entity.radius);
        pushEntity(lines, "CIRCLE", entityLayer, [
          ["10", formatNum(center[0])],
          ["20", formatNum(center[1])],
          ["30", "0"],
          ["40", formatNum(radius)],
        ]);
        break;
      }
      default: {
        const poly = polylineForEntity(entity, {
          cornerRotationPivot: "center",
          slotStart: "left",
          splineMode: "control-points",
        });
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
