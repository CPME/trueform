import type { ID, Point2D, SketchEntity } from "../ir.js";
import type { PlaneBasis } from "./plane_basis.js";
import {
  sketchEntityToSegments as buildSketchEntityToSegments,
  type SketchEdgeSegment,
} from "./sketch_segments.js";

export type SketchWireBuilderDeps = {
  newOcct: (name: string, ...args: any[]) => any;
  addWireEdge: (builder: any, edge: any) => boolean;
  checkLoopContinuity: (segments: SketchEdgeSegment[], allowOpen: boolean) => boolean;
  point2To3: (point: Point2D, sketchPlane: PlaneBasis) => [number, number, number];
  point2Numbers: (point: Point2D, label: string) => [number, number];
  dist2: (a: Point2D, b: Point2D) => number;
  arcMidpoint: (start: Point2D, end: Point2D, center: Point2D, direction: "cw" | "ccw") => Point2D;
  ellipseAxes: (
    sketchPlane: PlaneBasis,
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
    sketchPlane: PlaneBasis
  ) => { edge: any; start: [number, number, number]; end: [number, number, number]; closed: boolean };
};

export function buildSketchWire(
  loop: ID[],
  entityMap: Map<ID, SketchEntity>,
  plane: PlaneBasis,
  deps: SketchWireBuilderDeps
) {
  return buildSketchWireWithStatus(loop, entityMap, plane, false, deps).wire;
}

export function buildSketchWireWithStatus(
  loop: ID[],
  entityMap: Map<ID, SketchEntity>,
  plane: PlaneBasis,
  allowOpen: boolean,
  deps: SketchWireBuilderDeps
): { wire: any; closed: boolean } {
  const segments: SketchEdgeSegment[] = [];
  for (const id of loop) {
    const entity = entityMap.get(id);
    if (!entity) {
      throw new Error(`OCCT backend: sketch entity ${id} not found`);
    }
    segments.push(...buildEntitySegments(entity, plane, deps));
  }
  const closed = deps.checkLoopContinuity(segments, allowOpen);
  const wireBuilder = deps.newOcct("BRepBuilderAPI_MakeWire");
  for (const segment of segments) {
    if (!deps.addWireEdge(wireBuilder, segment.edge)) {
      throw new Error("OCCT backend: wire builder missing Add()");
    }
  }
  if (typeof wireBuilder.Wire === "function") return { wire: wireBuilder.Wire(), closed };
  if (typeof wireBuilder.wire === "function") return { wire: wireBuilder.wire(), closed };
  if (wireBuilder.Shape) return { wire: wireBuilder.Shape(), closed };
  throw new Error("OCCT backend: wire builder missing Wire()");
}

export function segmentSlotsForLoop(
  loop: ID[],
  entityMap: Map<ID, SketchEntity>,
  plane: PlaneBasis,
  deps: SketchWireBuilderDeps
): string[] {
  const slots: string[] = [];
  for (const id of loop) {
    const entity = entityMap.get(id);
    if (!entity) {
      throw new Error(`OCCT backend: sketch entity ${id} not found`);
    }
    for (const segment of buildEntitySegments(entity, plane, deps)) {
      slots.push(segment.sourceSlot ?? entity.id);
    }
  }
  return slots;
}

function buildEntitySegments(
  entity: SketchEntity,
  plane: PlaneBasis,
  deps: SketchWireBuilderDeps
): SketchEdgeSegment[] {
  return buildSketchEntityToSegments({
    entity,
    plane,
    deps: {
      withEntitySegmentSlots,
      point2To3: deps.point2To3,
      point2Numbers: deps.point2Numbers,
      dist2: deps.dist2,
      arcMidpoint: deps.arcMidpoint,
      ellipseAxes: deps.ellipseAxes,
      rectanglePoints: deps.rectanglePoints,
      polygonPoints: deps.polygonPoints,
      rotateTranslate2: deps.rotateTranslate2,
      makeLineEdge: deps.makeLineEdge,
      makeArcEdge: deps.makeArcEdge,
      makeCircleEdge: deps.makeCircleEdge,
      makeEllipseEdge: deps.makeEllipseEdge,
      makeSplineEdge: deps.makeSplineEdge,
    },
  });
}

function withEntitySegmentSlots(
  entityId: string,
  segments: SketchEdgeSegment[]
): SketchEdgeSegment[] {
  if (segments.length <= 1) {
    return segments.map((segment) => ({ ...segment, sourceSlot: entityId }));
  }
  return segments.map((segment, index) => ({
    ...segment,
    sourceSlot: `${entityId}.${index + 1}`,
  }));
}
