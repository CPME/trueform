import type { Point2D, SketchEntity } from "../ir.js";
import type { PlaneBasis } from "./plane_basis.js";
import { expectNumber } from "./vector_math.js";

export type SketchEdgeSegment = {
  edge: any;
  start: [number, number, number];
  end: [number, number, number];
  closed?: boolean;
  sourceSlot?: string;
};

type SketchSegmentDeps = {
  withEntitySegmentSlots: (entityId: string, segments: SketchEdgeSegment[]) => SketchEdgeSegment[];
  point2To3: (point: Point2D, plane: PlaneBasis) => [number, number, number];
  point2Numbers: (point: Point2D, label: string) => [number, number];
  dist2: (a: Point2D, b: Point2D) => number;
  arcMidpoint: (start: Point2D, end: Point2D, center: Point2D, direction: "cw" | "ccw") => Point2D;
  ellipseAxes: (
    plane: PlaneBasis,
    radiusX: number,
    radiusY: number,
    rotation: number
  ) => { major: number; minor: number; xDir: [number, number, number] };
  rectanglePoints: (entity: Extract<SketchEntity, { kind: "sketch.rectangle" }>) => Point2D[];
  polygonPoints: (entity: Extract<SketchEntity, { kind: "sketch.polygon" }>) => Point2D[];
  rotateTranslate2: (point: Point2D, origin: Point2D, angle: number) => Point2D;
  makeLineEdge: (start: [number, number, number], end: [number, number, number]) => any;
  makeArcEdge: (
    start: [number, number, number],
    mid: [number, number, number],
    end: [number, number, number]
  ) => any;
  makeCircleEdge: (
    center: [number, number, number],
    radius: number,
    normal: [number, number, number]
  ) => any;
  makeEllipseEdge: (
    center: [number, number, number],
    xDir: [number, number, number],
    normal: [number, number, number],
    major: number,
    minor: number
  ) => any;
  makeSplineEdge: (
    entity: Extract<SketchEntity, { kind: "sketch.spline" }>,
    plane: PlaneBasis
  ) => { edge: any; start: [number, number, number]; end: [number, number, number]; closed: boolean };
};

export function sketchEntityToSegments(params: {
  entity: SketchEntity;
  plane: PlaneBasis;
  deps: SketchSegmentDeps;
}): SketchEdgeSegment[] {
  const { entity, plane, deps } = params;
  switch (entity.kind) {
    case "sketch.line": {
      const start = deps.point2To3(entity.start, plane);
      const end = deps.point2To3(entity.end, plane);
      return deps.withEntitySegmentSlots(entity.id, [{ edge: deps.makeLineEdge(start, end), start, end }]);
    }
    case "sketch.arc": {
      const start2 = entity.start;
      const end2 = entity.end;
      const center2 = entity.center;
      const start = deps.point2To3(start2, plane);
      const end = deps.point2To3(end2, plane);
      const radiusStart = deps.dist2(start2, center2);
      const radiusEnd = deps.dist2(end2, center2);
      if (Math.abs(radiusStart - radiusEnd) > 1e-6) {
        throw new Error("OCCT backend: sketch arc radius mismatch");
      }
      const mid2 = deps.arcMidpoint(start2, end2, center2, entity.direction);
      const mid = deps.point2To3(mid2, plane);
      return deps.withEntitySegmentSlots(entity.id, [{ edge: deps.makeArcEdge(start, mid, end), start, end }]);
    }
    case "sketch.circle": {
      const center = deps.point2To3(entity.center, plane);
      const radius = expectNumber(entity.radius, "sketch circle radius");
      return deps.withEntitySegmentSlots(entity.id, [
        { edge: deps.makeCircleEdge(center, radius, plane.normal), start: center, end: center, closed: true },
      ]);
    }
    case "sketch.ellipse": {
      const center2 = deps.point2Numbers(entity.center, "sketch ellipse center");
      const center = deps.point2To3([center2[0], center2[1]], plane);
      const radiusX = expectNumber(entity.radiusX, "sketch ellipse radiusX");
      const radiusY = expectNumber(entity.radiusY, "sketch ellipse radiusY");
      const rotation =
        entity.rotation === undefined ? 0 : expectNumber(entity.rotation, "sketch ellipse rotation");
      const { major, minor, xDir } = deps.ellipseAxes(plane, radiusX, radiusY, rotation);
      return deps.withEntitySegmentSlots(entity.id, [
        {
          edge: deps.makeEllipseEdge(center, xDir, plane.normal, major, minor),
          start: center,
          end: center,
          closed: true,
        },
      ]);
    }
    case "sketch.rectangle": {
      const points = deps.rectanglePoints(entity);
      const segments: SketchEdgeSegment[] = [];
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!a || !b) continue;
        const start = deps.point2To3(a, plane);
        const end = deps.point2To3(b, plane);
        segments.push({ edge: deps.makeLineEdge(start, end), start, end });
      }
      return deps.withEntitySegmentSlots(entity.id, segments);
    }
    case "sketch.slot": {
      return deps.withEntitySegmentSlots(entity.id, slotSegments(entity, plane, deps));
    }
    case "sketch.polygon": {
      const points = deps.polygonPoints(entity);
      const segments: SketchEdgeSegment[] = [];
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!a || !b) continue;
        const start = deps.point2To3(a, plane);
        const end = deps.point2To3(b, plane);
        segments.push({ edge: deps.makeLineEdge(start, end), start, end });
      }
      return deps.withEntitySegmentSlots(entity.id, segments);
    }
    case "sketch.spline": {
      const { edge, start, end, closed } = deps.makeSplineEdge(entity, plane);
      return deps.withEntitySegmentSlots(entity.id, [{ edge, start, end, closed }]);
    }
    default:
      throw new Error(`OCCT backend: unsupported sketch entity ${entity.kind}`);
  }
}

function slotSegments(
  entity: Extract<SketchEntity, { kind: "sketch.slot" }>,
  plane: PlaneBasis,
  deps: SketchSegmentDeps
): SketchEdgeSegment[] {
  const length = expectNumber(entity.length, "sketch slot length");
  const width = expectNumber(entity.width, "sketch slot width");
  const radius = width / 2;
  if (radius <= 0 || length <= 0) {
    throw new Error("OCCT backend: sketch slot dimensions must be positive");
  }
  if (entity.endStyle === "straight") {
    const points = deps.rectanglePoints({
      ...entity,
      kind: "sketch.rectangle",
      mode: "center",
      center: entity.center,
      width: length,
      height: width,
    });
    const segments: SketchEdgeSegment[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (!a || !b) continue;
      const start = deps.point2To3(a, plane);
      const end = deps.point2To3(b, plane);
      segments.push({ edge: deps.makeLineEdge(start, end), start, end });
    }
    return segments;
  }
  const straightHalf = Math.max(0, length / 2 - radius);
  if (straightHalf === 0) {
    const center = deps.point2To3(entity.center, plane);
    return [{ edge: deps.makeCircleEdge(center, radius, plane.normal), start: center, end: center, closed: true }];
  }
  const rot = entity.rotation === undefined ? 0 : expectNumber(entity.rotation, "sketch slot rotation");
  const center2 = entity.center;
  const topRight: Point2D = [straightHalf, radius];
  const topLeft: Point2D = [-straightHalf, radius];
  const bottomRight: Point2D = [straightHalf, -radius];
  const bottomLeft: Point2D = [-straightHalf, -radius];
  const pts = [topRight, bottomRight, bottomLeft, topLeft].map((p) =>
    deps.rotateTranslate2(p, center2, rot)
  );
  const [tr, br, bl, tl] = pts;
  if (!tr || !br || !bl || !tl) {
    throw new Error("OCCT backend: failed to build sketch slot points");
  }
  const segments: SketchEdgeSegment[] = [];
  const tr3 = deps.point2To3(tr, plane);
  const br3 = deps.point2To3(br, plane);
  const bl3 = deps.point2To3(bl, plane);
  const tl3 = deps.point2To3(tl, plane);
  const leftMid2 = deps.rotateTranslate2([-straightHalf - radius, 0], center2, rot);
  const rightMid2 = deps.rotateTranslate2([straightHalf + radius, 0], center2, rot);
  const leftMid3 = deps.point2To3(leftMid2, plane);
  const rightMid3 = deps.point2To3(rightMid2, plane);
  segments.push({ edge: deps.makeLineEdge(tr3, tl3), start: tr3, end: tl3 });
  segments.push({ edge: deps.makeArcEdge(tl3, leftMid3, bl3), start: tl3, end: bl3 });
  segments.push({ edge: deps.makeLineEdge(bl3, br3), start: bl3, end: br3 });
  segments.push({ edge: deps.makeArcEdge(br3, rightMid3, tr3), start: br3, end: tr3 });
  return segments;
}
