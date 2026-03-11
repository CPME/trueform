import type { Point2D, SketchEntity } from "../ir.js";
import type { PlaneBasis } from "./plane_basis.js";
import { expectNumber } from "./vector_math.js";

export function polygonPoints(
  entity: Extract<SketchEntity, { kind: "sketch.polygon" }>
): Point2D[] {
  const sides = Math.round(expectNumber(entity.sides, "sketch polygon sides"));
  if (sides < 3) {
    throw new Error("OCCT backend: sketch polygon must have at least 3 sides");
  }
  const radius = expectNumber(entity.radius, "sketch polygon radius");
  const rot =
    entity.rotation === undefined ? 0 : expectNumber(entity.rotation, "sketch polygon rotation");
  const center = point2Numbers(entity.center, "sketch polygon center");
  const points: Point2D[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = rot + (Math.PI * 2 * i) / sides;
    points.push([center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)]);
  }
  return points;
}

export function rectanglePoints(
  entity: Extract<SketchEntity, { kind: "sketch.rectangle" }>
): Point2D[] {
  const rot = entity.rotation === undefined ? 0 : expectNumber(entity.rotation, "sketch rect rotation");
  if (entity.mode === "center") {
    const hw = expectNumber(entity.width, "sketch rect width") / 2;
    const hh = expectNumber(entity.height, "sketch rect height") / 2;
    const center = point2Numbers(entity.center, "sketch rect center");
    const pts: Point2D[] = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    return pts.map((p) => rotateTranslate2(p, center, rot));
  }
  const width = expectNumber(entity.width, "sketch rect width");
  const height = expectNumber(entity.height, "sketch rect height");
  const corner = point2Numbers(entity.corner, "sketch rect corner");
  const pts: Point2D[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  return pts.map((p) => rotateTranslate2(p, corner, rot));
}

export function rotateTranslate2(point: Point2D, origin: Point2D, angle: number): Point2D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const p = point2Numbers(point, "sketch point");
  const o = point2Numbers(origin, "sketch origin");
  const x = p[0] * cos - p[1] * sin + o[0];
  const y = p[0] * sin + p[1] * cos + o[1];
  return [x, y];
}

export function point2To3(point: Point2D, plane: PlaneBasis): [number, number, number] {
  const p = point2Numbers(point, "sketch point");
  return [
    plane.origin[0] + plane.xDir[0] * p[0] + plane.yDir[0] * p[1],
    plane.origin[1] + plane.xDir[1] * p[0] + plane.yDir[1] * p[1],
    plane.origin[2] + plane.xDir[2] * p[0] + plane.yDir[2] * p[1],
  ];
}

export function point2Numbers(point: Point2D, label: string): [number, number] {
  return [expectNumber(point[0], `${label} x`), expectNumber(point[1], `${label} y`)];
}

export function ellipseAxes(
  plane: PlaneBasis,
  radiusX: number,
  radiusY: number,
  rotation: number
): { major: number; minor: number; xDir: [number, number, number] } {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const xDir: [number, number, number] = [
    plane.xDir[0] * cos + plane.yDir[0] * sin,
    plane.xDir[1] * cos + plane.yDir[1] * sin,
    plane.xDir[2] * cos + plane.yDir[2] * sin,
  ];
  const yDir: [number, number, number] = [
    -plane.xDir[0] * sin + plane.yDir[0] * cos,
    -plane.xDir[1] * sin + plane.yDir[1] * cos,
    -plane.xDir[2] * sin + plane.yDir[2] * cos,
  ];
  if (radiusX >= radiusY) {
    return { major: radiusX, minor: radiusY, xDir };
  }
  return { major: radiusY, minor: radiusX, xDir: yDir };
}

export function dist2(a: Point2D, b: Point2D): number {
  const aNum = point2Numbers(a, "sketch point");
  const bNum = point2Numbers(b, "sketch point");
  const dx = aNum[0] - bNum[0];
  const dy = aNum[1] - bNum[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export function arcMidpoint(
  start: Point2D,
  end: Point2D,
  center: Point2D,
  direction: "cw" | "ccw"
): Point2D {
  const s = point2Numbers(start, "sketch arc start");
  const e = point2Numbers(end, "sketch arc end");
  const c = point2Numbers(center, "sketch arc center");
  const startAngle = Math.atan2(s[1] - c[1], s[0] - c[0]);
  const endAngle = Math.atan2(e[1] - c[1], e[0] - c[0]);
  let sweep = endAngle - startAngle;
  if (direction === "ccw") {
    if (sweep <= 0) sweep += Math.PI * 2;
  } else if (sweep >= 0) {
    sweep -= Math.PI * 2;
  }
  const midAngle = startAngle + sweep / 2;
  const radius = dist2(start, center);
  return [c[0] + radius * Math.cos(midAngle), c[1] + radius * Math.sin(midAngle)];
}
