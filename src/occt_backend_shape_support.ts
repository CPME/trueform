import {
  BackendCapabilities,
  KernelObject,
  KernelSelection,
  KernelSelectionRecord,
} from "./backend.js";
import { AxisDirection, ID, Point2D, Point3D } from "./ir.js";
import {
  addLoftWire as addOcctLoftWire,
  makeBoolean as makeOcctBoolean,
  makeChamferBuilder as makeOcctChamferBuilder,
  makeDraftBuilder as makeOcctDraftBuilder,
  makeFilletBuilder as makeOcctFilletBuilder,
  makeLoftBuilder as makeOcctLoftBuilder,
  makeSection as makeOcctSection,
} from "./occt/builder_primitives.js";
import {
  annotateEdgeAdjacencyMetadata as annotateOcctEdgeAdjacencyMetadata,
  cylinderFromFace as resolveOcctCylinderFromFace,
} from "./occt/metadata_ops.js";
import type { MetadataContext } from "./occt/operation_contexts.js";
import {
  axisBounds as resolveOcctAxisBounds,
  countFaces as countOcctFaces,
  cylinderReferenceXDirection as resolveOcctCylinderReferenceXDirection,
  cylinderVExtents as resolveOcctCylinderVExtents,
  firstFace as resolveOcctFirstFace,
  listFaces as resolveOcctListFaces,
  makeCompoundFromShapes as makeOcctCompoundFromShapes,
  shapeBounds as resolveOcctShapeBounds,
  shapeCenter as resolveOcctShapeCenter,
  surfaceUvExtents as resolveOcctSurfaceUvExtents,
  type ShapeAnalysisPrimitiveDeps,
} from "./occt/shape_analysis_primitives.js";
import {
  collectEdgesFromShape as collectOcctEdgesFromShape,
  collectFacesFromShape as collectOcctFacesFromShape,
  collectToolFaces as collectOcctToolFaces,
  containsShape as containsOcctShape,
  deleteFacesBySewing as deleteOcctFacesBySewing,
  deleteFacesWithDefeaturing as deleteOcctFacesWithDefeaturing,
  isValidShape as isOcctValidShape,
  makeSolidFromShells as makeOcctSolidFromShells,
  replaceFacesBySewing as replaceOcctFacesBySewing,
  replaceFacesWithReshape as replaceOcctFacesWithReshape,
  solidVolume as resolveOcctSolidVolume,
  uniqueFaceShapes as collectOcctUniqueFaceShapes,
  uniqueShapeList as collectOcctUniqueShapeList,
  type ShapeMutationPrimitiveDeps,
} from "./occt/shape_mutation_primitives.js";
import {
  dot,
  isFiniteVec,
  normalizeVector,
} from "./occt/vector_math.js";
import type { BuilderPrimitiveDeps } from "./occt/builder_primitives.js";

export abstract class OcctBackendShapeSupport {
  protected abstract occt: any;

  protected abstract metadataContext(): MetadataContext;
  protected abstract shapeAnalysisDeps(): ShapeAnalysisPrimitiveDeps;
  protected abstract shapeMutationPrimitiveDeps(): ShapeMutationPrimitiveDeps;
  protected abstract builderPrimitiveDeps(): BuilderPrimitiveDeps;
  protected abstract sampleEdgePoints(edge: any, opts: any): Array<[number, number, number]>;
  protected abstract makeProgressRange(): any;
  protected abstract callWithFallback(target: any, names: string[], argsList: unknown[][]): unknown;
  protected abstract newOcct(name: string, ...args: unknown[]): any;
  protected abstract makePnt(x: number, y: number, z: number): any;
  protected abstract makeDir(x: number, y: number, z: number): any;
  protected abstract makeAx2(pnt: any, dir: any): any;
  protected abstract makeWireFromEdges(edges: any[]): any;
  protected abstract makeLineEdge(start: [number, number, number], end: [number, number, number]): any;
  protected abstract makeFaceFromWire(wire: any): any;
  protected abstract readFace(builder: any): any;

  protected subVec(a: [number, number, number], b: [number, number, number]): [number, number, number] {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  protected shapeBoundsOverlap(a: any, b: any, tolerance = 1e-6): boolean {
    const left = this.shapeBounds(a);
    const right = this.shapeBounds(b);
    return !(
      left.max[0] < right.min[0] - tolerance ||
      right.max[0] < left.min[0] - tolerance ||
      left.max[1] < right.min[1] - tolerance ||
      right.max[1] < left.min[1] - tolerance ||
      left.max[2] < right.min[2] - tolerance ||
      right.max[2] < left.min[2] - tolerance
    );
  }

  protected edgeDirection(edge: any, label: string): [number, number, number] {
    const points = this.sampleEdgePoints(edge, { edgeSegmentLength: 0.5, edgeMaxSegments: 8 });
    if (points.length < 2) {
      throw new Error(`OCCT backend: ${label} edge has insufficient sample points`);
    }
    const start = points[0];
    const end = points[points.length - 1];
    if (!start || !end) {
      throw new Error(`OCCT backend: ${label} edge points are missing`);
    }
    const direction = normalizeVector(this.subVec(end, start));
    if (!isFiniteVec(direction)) {
      throw new Error(`OCCT backend: ${label} edge direction is degenerate`);
    }
    return direction;
  }

  protected projectBoundsOnBasis(
    points: Array<[number, number, number]>,
    origin: [number, number, number],
    xDir: [number, number, number],
    yDir: [number, number, number]
  ): { uMin: number; uMax: number; vMin: number; vMax: number } {
    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const point of points) {
      const delta = this.subVec(point, origin);
      const u = dot(delta, xDir);
      const v = dot(delta, yDir);
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    if (![uMin, uMax, vMin, vMax].every((value) => Number.isFinite(value))) {
      throw new Error("OCCT backend: failed to project planar bounds");
    }
    return { uMin, uMax, vMin, vMax };
  }

  protected classifyPlanarBoundaryEdge(
    edge: any,
    origin: [number, number, number],
    xDir: [number, number, number],
    yDir: [number, number, number],
    extents: { uMin: number; uMax: number; vMin: number; vMax: number },
    tolerance: number
  ): "uMin" | "uMax" | "vMin" | "vMax" | null {
    const points = this.sampleEdgePoints(edge, { edgeSegmentLength: 0.5, edgeMaxSegments: 8 });
    if (points.length < 2) return null;
    const projected = this.projectBoundsOnBasis(points, origin, xDir, yDir);
    const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
    const uSpan = projected.uMax - projected.uMin;
    const vSpan = projected.vMax - projected.vMin;
    const uMid = (projected.uMin + projected.uMax) / 2;
    const vMid = (projected.vMin + projected.vMax) / 2;
    const axisTolerance = tolerance * 4;
    if (uSpan <= axisTolerance && near(uMid, extents.uMin)) return "uMin";
    if (uSpan <= axisTolerance && near(uMid, extents.uMax)) return "uMax";
    if (vSpan <= axisTolerance && near(vMid, extents.vMin)) return "vMin";
    if (vSpan <= axisTolerance && near(vMid, extents.vMax)) return "vMax";
    return null;
  }

  protected makePlanarRectFace(
    origin: [number, number, number],
    xDir: [number, number, number],
    yDir: [number, number, number],
    extents: { uMin: number; uMax: number; vMin: number; vMax: number }
  ): any {
    const corner = (u: number, v: number): [number, number, number] => [
      origin[0] + xDir[0] * u + yDir[0] * v,
      origin[1] + xDir[1] * u + yDir[1] * v,
      origin[2] + xDir[2] * u + yDir[2] * v,
    ];
    const corners: Array<[number, number, number]> = [
      corner(extents.uMin, extents.vMin),
      corner(extents.uMax, extents.vMin),
      corner(extents.uMax, extents.vMax),
      corner(extents.uMin, extents.vMax),
    ];
    const wire = this.makeWireFromEdges([
      this.makeLineEdge(corners[0]!, corners[1]!),
      this.makeLineEdge(corners[1]!, corners[2]!),
      this.makeLineEdge(corners[2]!, corners[3]!),
      this.makeLineEdge(corners[3]!, corners[0]!),
    ]);
    return this.readFace(this.makeFaceFromWire(wire));
  }

  protected shapeBounds(shape: any): { min: [number, number, number]; max: [number, number, number] } {
    return resolveOcctShapeBounds(this.shapeAnalysisDeps(), shape);
  }

  protected firstFace(shape: any): any | null {
    return resolveOcctFirstFace(this.shapeAnalysisDeps(), shape);
  }

  protected listFaces(shape: any): any[] {
    return resolveOcctListFaces(this.shapeAnalysisDeps(), shape);
  }

  protected countFaces(shape: any): number {
    return countOcctFaces(this.shapeAnalysisDeps(), shape);
  }

  protected makeCompoundFromShapes(shapes: any[]): any {
    return makeOcctCompoundFromShapes(this.shapeAnalysisDeps(), shapes);
  }

  protected axisBounds(
    axis: [number, number, number],
    bounds: { min: [number, number, number]; max: [number, number, number] }
  ): { min: number; max: number } | null {
    return resolveOcctAxisBounds(axis, bounds);
  }

  protected cylinderFromFace(face: any) {
    return resolveOcctCylinderFromFace(this.metadataContext(), face);
  }

  protected cylinderReferenceXDirection(cylinder: {
    axis: [number, number, number];
    xDir?: [number, number, number];
    yDir?: [number, number, number];
  }): [number, number, number] {
    return resolveOcctCylinderReferenceXDirection(cylinder);
  }

  protected cylinderVExtents(
    face: any,
    cylinder: { origin: [number, number, number]; axis: [number, number, number] }
  ): { min: number; max: number } | null {
    return resolveOcctCylinderVExtents(this.shapeAnalysisDeps(), face, cylinder);
  }

  protected surfaceUvExtents(face: any) {
    return resolveOcctSurfaceUvExtents(this.shapeAnalysisDeps(), face);
  }

  protected shapeCenter(shape: any): [number, number, number] {
    return resolveOcctShapeCenter(this.shapeAnalysisDeps(), shape);
  }

  protected throughAllDepth(
    shape: any,
    axisDir: [number, number, number],
    origin?: [number, number, number]
  ): number {
    if (origin) {
      const axis = normalizeVector(axisDir);
      if (isFiniteVec(axis)) {
        const extents = this.axisBounds(axis, this.shapeBounds(shape));
        if (extents) {
          const start = dot(origin, axis);
          const next = extents.max - start;
          if (next > 1e-6) {
            return next + Math.max(0.05, next * 0.02);
          }
        }
      }
    }
    const bounds = this.shapeBounds(shape);
    const lenX = bounds.max[0] - bounds.min[0];
    const lenY = bounds.max[1] - bounds.min[1];
    const lenZ = bounds.max[2] - bounds.min[2];
    const base =
      Math.abs(axisDir[0]) > 0.5 ? lenX : Math.abs(axisDir[1]) > 0.5 ? lenY : lenZ;
    const margin = Math.max(base * 0.2, 1);
    return base + margin;
  }

  protected makeCylinder(
    radius: number,
    height: number,
    axisDir: [number, number, number],
    origin: [number, number, number]
  ) {
    const pnt = this.makePnt(origin[0], origin[1], origin[2]);
    const dir = this.makeDir(axisDir[0], axisDir[1], axisDir[2]);
    const ax2 = this.makeAx2(pnt, dir);
    const ctorWithAxis = this.occt.BRepPrimAPI_MakeCylinder_3;
    if (typeof ctorWithAxis === "function") {
      return new ctorWithAxis(ax2, radius, height);
    }
    for (const args of [[ax2, radius, height], [radius, height]] as Array<unknown[]>) {
      try {
        return this.newOcct("BRepPrimAPI_MakeCylinder", ...args);
      } catch {
        continue;
      }
    }
    throw new Error("OCCT backend: failed to construct cylinder");
  }

  protected makeCone(
    radius1: number,
    radius2: number,
    height: number,
    axisDir: [number, number, number],
    origin: [number, number, number]
  ) {
    const pnt = this.makePnt(origin[0], origin[1], origin[2]);
    const dir = this.makeDir(axisDir[0], axisDir[1], axisDir[2]);
    const ax2 = this.makeAx2(pnt, dir);
    const ctorWithAxis = this.occt.BRepPrimAPI_MakeCone_3;
    if (typeof ctorWithAxis === "function") {
      return new ctorWithAxis(ax2, radius1, radius2, height);
    }
    for (const args of [
      [ax2, radius1, radius2, height],
      [ax2, radius1, radius2, height, 0],
      [radius1, radius2, height],
      [radius1, radius2, height, 0],
    ] as Array<unknown[]>) {
      try {
        return this.newOcct("BRepPrimAPI_MakeCone", ...args);
      } catch {
        continue;
      }
    }
    throw new Error("OCCT backend: failed to construct cone");
  }

  protected makeFilletBuilder(shape: any) {
    return makeOcctFilletBuilder(this.builderPrimitiveDeps(), shape);
  }

  protected makeChamferBuilder(shape: any) {
    return makeOcctChamferBuilder(this.builderPrimitiveDeps(), shape);
  }

  protected makeDraftBuilder(shape: any) {
    return makeOcctDraftBuilder(this.builderPrimitiveDeps(), shape);
  }

  protected makeLoftBuilder(isSolid: boolean) {
    return makeOcctLoftBuilder(this.builderPrimitiveDeps(), isSolid);
  }

  protected addLoftWire(builder: any, wire: any) {
    return addOcctLoftWire(this.builderPrimitiveDeps(), builder, wire);
  }

  protected makeBoolean(op: "union" | "subtract" | "intersect" | "cut", left: any, right: any) {
    return makeOcctBoolean(this.builderPrimitiveDeps(), op, left, right);
  }

  protected makeSection(left: any, right: any) {
    return makeOcctSection(this.builderPrimitiveDeps(), left, right);
  }

  protected splitByTools(result: any, tools: any[]): any {
    if (!this.occt.BOPAlgo_Splitter_1) return result;
    const progress = this.makeProgressRange();
    if (!progress) return result;
    let splitter: any;
    try {
      splitter = this.newOcct("BOPAlgo_Splitter");
    } catch {
      return result;
    }
    const call = (name: string, ...args: unknown[]) => {
      const method = splitter?.[name];
      if (typeof method !== "function") return false;
      try {
        method.apply(splitter, args);
        return true;
      } catch {
        return false;
      }
    };
    call("SetNonDestructive", true);
    const glueOff = this.occt.BOPAlgo_GlueEnum?.BOPAlgo_GlueOff;
    if (glueOff) call("SetGlue", glueOff);
    call("AddArgument", result);
    for (const tool of tools) {
      if (!tool) continue;
      call("AddTool", tool);
    }
    try {
      splitter.Perform(progress);
    } catch {
      return result;
    }
    try {
      return this.callWithFallback(splitter, ["Shape", "Shape_1"], [[]]);
    } catch {
      return result;
    }
  }

  protected unifySameDomain(shape: any): any {
    let unifier: any;
    const ctorArgs: unknown[][] = [
      [shape, true, true, true],
      [shape, true, true, false],
      [shape, true, true],
      [shape],
    ];
    for (const args of ctorArgs) {
      try {
        unifier = this.newOcct("ShapeUpgrade_UnifySameDomain", ...args);
        break;
      } catch {
        continue;
      }
    }
    if (!unifier) return shape;
    try {
      this.callWithFallback(unifier, ["Build", "Build_1"], [[]]);
    } catch {
      return shape;
    }
    try {
      return this.callWithFallback(unifier, ["Shape", "Shape_1"], [[]]);
    } catch {
      return shape;
    }
  }

  protected normalizeSolid(shape: any): any {
    const unified = this.unifySameDomain(shape);
    if (this.shapeHasSolid(unified)) return unified;
    const solidified = this.makeSolidFromShells(unified);
    if (solidified && this.shapeHasSolid(solidified)) return solidified;
    return unified;
  }

  protected countSolids(shape: any): number {
    const explorer = new this.occt.TopExp_Explorer_1();
    explorer.Init(shape, this.occt.TopAbs_ShapeEnum.TopAbs_SOLID, this.occt.TopAbs_ShapeEnum.TopAbs_SHAPE);
    let count = 0;
    for (; explorer.More(); explorer.Next()) count += 1;
    return count;
  }

  protected reverseShape(shape: any): any {
    const reversedCandidates = ["Reversed", "Reversed_1", "Reversed_2"];
    for (const name of reversedCandidates) {
      const fn = shape?.[name];
      if (typeof fn !== "function") continue;
      try {
        const candidate = fn.call(shape);
        if (candidate) return candidate;
      } catch {
        continue;
      }
    }
    const reverseCandidates = ["Reverse", "Reverse_1", "Reverse_2"];
    for (const name of reverseCandidates) {
      const fn = shape?.[name];
      if (typeof fn !== "function") continue;
      try {
        fn.call(shape);
        return shape;
      } catch {
        continue;
      }
    }
    return shape;
  }

  protected shapeHasSolid(shape: any): boolean {
    return this.countSolids(shape) > 0;
  }

  protected makeSolidFromShells(shape: any): any | null {
    return makeOcctSolidFromShells(this.shapeMutationPrimitiveDeps(), shape);
  }

  protected deleteFacesWithDefeaturing(shape: any, removeFaces: any[]): any | null {
    return deleteOcctFacesWithDefeaturing(this.shapeMutationPrimitiveDeps(), shape, removeFaces);
  }

  protected deleteFacesBySewing(shape: any, removeFaces: any[]): any | null {
    return deleteOcctFacesBySewing(this.shapeMutationPrimitiveDeps(), shape, removeFaces);
  }

  protected replaceFacesWithReshape(shape: any, replacements: Array<{ from: any; to: any }>): any | null {
    return replaceOcctFacesWithReshape(this.shapeMutationPrimitiveDeps(), shape, replacements);
  }

  protected replaceFacesBySewing(
    shape: any,
    removeFaces: any[],
    replacements: Array<{ from: any; to: any }>
  ): any | null {
    return replaceOcctFacesBySewing(this.shapeMutationPrimitiveDeps(), shape, removeFaces, replacements);
  }

  protected uniqueFaceShapes(selections: KernelSelection[]): any[] {
    return collectOcctUniqueFaceShapes(this.shapeMutationPrimitiveDeps(), selections);
  }

  protected collectToolFaces(selections: KernelSelection[]): any[] {
    return collectOcctToolFaces(this.shapeMutationPrimitiveDeps(), selections);
  }

  protected collectFacesFromShape(shape: any): any[] {
    return collectOcctFacesFromShape(this.shapeMutationPrimitiveDeps(), shape);
  }

  protected annotateEdgeAdjacencyMetadata(
    shape: any,
    edgeSelections: KernelSelectionRecord[],
    faceBindings: Array<{ shape: any; id: string; slot?: string; role?: string }>
  ): void {
    annotateOcctEdgeAdjacencyMetadata(this.metadataContext(), shape, edgeSelections, faceBindings);
  }

  protected collectEdgesFromShape(shape: any): any[] {
    return collectOcctEdgesFromShape(this.shapeMutationPrimitiveDeps(), shape);
  }

  protected uniqueShapeList(shapes: any[]): any[] {
    return collectOcctUniqueShapeList(this.shapeMutationPrimitiveDeps(), shapes);
  }

  protected containsShape(candidates: any[], shape: any): boolean {
    return containsOcctShape(this.shapeMutationPrimitiveDeps(), candidates, shape);
  }

  protected isValidShape(shape: any, kind: KernelObject["kind"] = "solid"): boolean {
    return isOcctValidShape(this.shapeMutationPrimitiveDeps(), shape, kind);
  }

  protected solidVolume(solid: any): number {
    return resolveOcctSolidVolume(this.shapeMutationPrimitiveDeps(), solid);
  }

  protected tryBuild(builder: any) {
    if (!builder || typeof builder.Build !== "function") return;
    const progress = this.makeProgressRange();
    try {
      builder.Build(progress);
      return;
    } catch {
      // fall through
    }
    try {
      builder.Build();
    } catch {
      // ignore build failures; some builders auto-build
    }
  }

  protected toFace(face: any) {
    const topo = this.occt.TopoDS;
    if (!topo?.Face_1) return face;
    return topo.Face_1(face);
  }

  protected toEdge(edge: any) {
    const topo = this.occt.TopoDS;
    if (!topo?.Edge_1) return edge;
    return topo.Edge_1(edge);
  }

  protected toWire(wire: any) {
    const topo = this.occt.TopoDS;
    if (!topo?.Wire_1) return wire;
    return topo.Wire_1(wire);
  }

  protected toShell(shell: any) {
    const topo = this.occt.TopoDS;
    if (!topo?.Shell_1) return shell;
    return topo.Shell_1(shell);
  }
}
