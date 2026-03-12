import type { ExecuteInput, KernelResult, KernelSelection } from "../backend.js";
import { hashValue } from "../hash.js";
import { resolveSelectorSet } from "../selectors.js";
import type { CurveIntersect, ExtendSurface, Knit, TrimSurface } from "../ir.js";
import { cross, expectNumber, isFiniteVec, normalizeVector } from "./vector_math.js";
import type { SurfaceEditContext } from "./operation_contexts.js";

export function execTrimSurface(ctx: SurfaceEditContext, feature: TrimSurface, upstream: KernelResult): KernelResult {
  const sourceTarget = ctx.resolveSingleSelection(feature.source, upstream, "trim surface source");
  if (sourceTarget.kind !== "face" && sourceTarget.kind !== "surface") {
    throw new Error("OCCT backend: trim surface source must resolve to face/surface");
  }
  const sourceShape = sourceTarget.meta["shape"];
  if (!sourceShape) {
    throw new Error("OCCT backend: trim surface source is missing shape");
  }
  const sourceFaceSelections = ctx.faceSelectionsForTarget(sourceTarget, upstream);
  if (sourceFaceSelections.length === 0) {
    throw new Error("OCCT backend: trim surface source resolved no source faces");
  }

  const toolSelections = feature.tools.flatMap((tool) =>
    resolveSelectorSet(tool, ctx.toResolutionContext(upstream))
  );
  if (toolSelections.length === 0) {
    throw new Error("OCCT backend: trim surface tools matched 0 entities");
  }
  for (const selection of toolSelections) {
    if (selection.kind !== "solid" && selection.kind !== "face" && selection.kind !== "surface") {
      throw new Error("OCCT backend: trim surface tools must resolve to solid/face/surface");
    }
  }

  const toolShapes = ctx.uniqueShapeList(
    toolSelections
      .map((selection) => selection.meta["shape"])
      .filter((shape): shape is any => !!shape)
  );
  if (toolShapes.length === 0) {
    throw new Error("OCCT backend: trim surface tools resolved no shapes");
  }
  if (!toolShapes.some((shape: any) => ctx.shapeBoundsOverlap(sourceShape, shape))) {
    throw new Error("OCCT backend: trim_surface_no_intersection");
  }

  let trimmed: any;
  if (feature.keep === "both") {
    trimmed = ctx.splitByTools(sourceShape, toolShapes);
    if (ctx.countFaces(trimmed) <= ctx.countFaces(sourceShape)) {
      throw new Error("OCCT backend: trim_surface_no_intersection");
    }
  } else {
    if (toolSelections.some((selection) => selection.kind !== "solid")) {
      throw new Error("OCCT backend: trim surface inside/outside currently requires solid tools");
    }
    const toolShape = toolShapes.length === 1 ? toolShapes[0] : ctx.makeCompoundFromShapes(toolShapes);
    const builder = ctx.makeBoolean(feature.keep === "inside" ? "intersect" : "cut", sourceShape, toolShape);
    trimmed = ctx.readShape(builder);
  }

  if (ctx.countFaces(trimmed) === 0) {
    throw new Error("OCCT backend: trim surface produced no remaining faces");
  }

  const outputKind: "face" | "surface" = ctx.countFaces(trimmed) === 1 ? "face" : "surface";
  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:${outputKind}`,
        kind: outputKind,
        meta: { shape: trimmed },
      },
    ],
  ]);
  const selections = ctx.collectSelections(trimmed, feature.id, feature.result, feature.tags, {
    rootKind: "face",
    ledgerPlan: ctx.makeSplitFaceSelectionLedgerPlan(upstream, sourceShape, sourceFaceSelections),
  });
  return { outputs, selections };
}

export function execExtendSurface(ctx: SurfaceEditContext, feature: ExtendSurface, upstream: KernelResult): KernelResult {
  const sourceTarget = ctx.resolveSingleSelection(feature.source, upstream, "extend surface source");
  if (sourceTarget.kind !== "face" && sourceTarget.kind !== "surface") {
    throw new Error("OCCT backend: extend surface source must resolve to face/surface");
  }
  const sourceFaces = ctx.faceSelectionsForTarget(sourceTarget, upstream);
  if (sourceFaces.length !== 1) {
    throw new Error("OCCT backend: extend surface currently requires a single-face source");
  }
  const sourceFace = sourceFaces[0];
  const sourceShape = sourceFace?.meta["shape"];
  if (!sourceShape) {
    throw new Error("OCCT backend: extend surface source face is missing shape");
  }

  const edgeSelections = resolveSelectorSet(feature.edges, ctx.toResolutionContext(upstream));
  if (edgeSelections.length === 0) {
    throw new Error("OCCT backend: extend surface edges matched 0 entities");
  }
  for (const selection of edgeSelections) {
    if (selection.kind !== "edge") {
      throw new Error("OCCT backend: extend surface edges must resolve to edges");
    }
  }

  const boundaryEdges = ctx.collectEdgesFromShape(sourceShape);
  if (boundaryEdges.length !== 4) {
    throw new Error("OCCT backend: extend surface currently supports rectangular planar faces only");
  }
  for (const selection of edgeSelections) {
    const edgeShape = selection.meta["shape"];
    if (!edgeShape || !ctx.containsShape(boundaryEdges, edgeShape)) {
      throw new Error("OCCT backend: extend surface edges must belong to the source boundary");
    }
  }

  const plane = ctx.planeBasisFromFace(sourceShape);
  const xDir = ctx.edgeDirection(boundaryEdges[0], "extend surface boundary");
  const yDir = normalizeVector(cross(plane.normal, xDir));
  if (!isFiniteVec(yDir)) {
    throw new Error("OCCT backend: extend surface failed to resolve boundary basis");
  }

  const boundarySamples = boundaryEdges.flatMap((edge: any) =>
    ctx.sampleEdgePoints(edge, { edgeSegmentLength: 0.5, edgeMaxSegments: 8 })
  );
  if (boundarySamples.length < 8) {
    throw new Error("OCCT backend: extend surface failed to sample source boundary");
  }
  const extents = ctx.projectBoundsOnBasis(boundarySamples, plane.origin, xDir, yDir);

  const distance = expectNumber(feature.distance, "extend surface distance");
  const next = { ...extents };
  next.uMin -= distance;
  next.uMax += distance;
  next.vMin -= distance;
  next.vMax += distance;

  const extended = ctx.makePlanarRectFace(plane.origin, xDir, yDir, next);
  if (!ctx.isValidShape(extended, "face")) {
    throw new Error("OCCT backend: extend surface produced invalid result");
  }

  const ownerShape = sourceFace.meta["owner"] ?? sourceShape;
  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:face`,
        kind: "face" as const,
        meta: { shape: extended },
      },
    ],
  ]);
  const selections = ctx.collectSelections(extended, feature.id, feature.result, feature.tags, {
    rootKind: "face",
    ledgerPlan: ctx.makeFaceMutationSelectionLedgerPlan(upstream, ownerShape, [{ from: sourceFace, to: extended }]),
  });
  return { outputs, selections };
}

export function execKnit(ctx: SurfaceEditContext, feature: Knit, upstream: KernelResult): KernelResult {
  const sourceTargets = feature.sources.flatMap((source) =>
    resolveSelectorSet(source, ctx.toResolutionContext(upstream))
  );
  if (sourceTargets.length === 0) {
    throw new Error("OCCT backend: knit sources matched 0 entities");
  }
  for (const target of sourceTargets) {
    if (target.kind !== "face" && target.kind !== "surface") {
      throw new Error("OCCT backend: knit sources must resolve to face/surface");
    }
  }

  const sourceFaces = ctx.uniqueKernelSelectionsById(
    sourceTargets.flatMap((target) => ctx.faceSelectionsForTarget(target, upstream))
  );
  if (sourceFaces.length === 0) {
    throw new Error("OCCT backend: knit sources resolved no source faces");
  }

  const faceShapes = ctx.uniqueShapeList(
    sourceFaces
      .map((selection: any) => selection.meta["shape"])
      .filter((shape: any): shape is any => !!shape)
      .map((shape: any) => ctx.toFace(shape))
  );
  if (faceShapes.length === 0) {
    throw new Error("OCCT backend: knit sources resolved no face shapes");
  }

  const tolerance =
    feature.tolerance === undefined ? 1e-6 : expectNumber(feature.tolerance, "knit tolerance");
  const seedShape = faceShapes.length === 1 ? faceShapes[0] : ctx.makeCompoundFromShapes(faceShapes);
  const sewed = ctx.sewShapeFaces(seedShape, tolerance) ?? seedShape;

  let outputShape = sewed;
  let outputKind: "solid" | "surface" | "face";
  if (feature.makeSolid) {
    const solid = ctx.makeSolidFromShells(sewed);
    if (!solid || !ctx.shapeHasSolid(solid) || !ctx.isValidShape(solid)) {
      throw new Error("OCCT backend: knit_non_watertight: unable to form solid from stitched surfaces");
    }
    outputShape = ctx.normalizeSolid(solid);
    outputKind = "solid";
  } else {
    outputKind = ctx.countFaces(outputShape) === 1 ? "face" : "surface";
  }

  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:${outputKind}`,
        kind: outputKind,
        meta: { shape: outputShape },
      },
    ],
  ]);
  const selections = ctx.collectSelections(
    outputShape,
    feature.id,
    feature.result,
    feature.tags,
    outputKind === "solid"
      ? { ledgerPlan: ctx.makeKnitSelectionLedgerPlan(sourceFaces) }
      : { rootKind: "face", ledgerPlan: ctx.makeKnitSelectionLedgerPlan(sourceFaces) }
  );
  return { outputs, selections };
}

export function execCurveIntersect(
  ctx: SurfaceEditContext,
  feature: CurveIntersect,
  upstream: KernelResult,
  resolve: ExecuteInput["resolve"]
): KernelResult {
  const first = resolve(feature.first, upstream);
  const second = resolve(feature.second, upstream);
  const supportedKinds = new Set<KernelSelection["kind"]>(["face", "surface", "solid"]);
  if (!supportedKinds.has(first.kind) || !supportedKinds.has(second.kind)) {
    throw new Error("OCCT backend: curve intersect currently supports face/surface/solid inputs");
  }

  const firstShape = first.meta["shape"];
  const secondShape = second.meta["shape"];
  if (!firstShape || !secondShape) {
    throw new Error("OCCT backend: curve intersect inputs are missing shape metadata");
  }

  const builder = ctx.makeSection(firstShape, secondShape);
  const rawShape = ctx.readShape(builder);
  const edges = ctx.uniqueShapeList(ctx.collectEdgesFromShape(rawShape));
  if (edges.length === 0) {
    throw new Error("OCCT backend: curve_intersect_no_intersection");
  }

  const outputShape = ctx.makeCompoundFromShapes(edges);
  const selections = ctx.collectSelections(outputShape, feature.id, feature.result, feature.tags, {
    ledgerPlan: {
      edges: (entries: any[]) => {
        const sorted = entries.slice().sort((a, b) => {
          const aTie = hashValue(ctx.selectionTieBreakerFingerprint("edge", a.meta));
          const bTie = hashValue(ctx.selectionTieBreakerFingerprint("edge", b.meta));
          const byTie = aTie.localeCompare(bTie);
          if (byTie !== 0) return byTie;
          return ctx.shapeHash(a.shape) - ctx.shapeHash(b.shape);
        });
        for (let i = 0; i < sorted.length; i += 1) {
          const entry = sorted[i];
          if (!entry) continue;
          ctx.applySelectionLedgerHint(entry, {
            slot: `curve.${i + 1}`,
            role: "curve",
            lineage: { kind: "created" },
          });
        }
      },
    },
  });

  const edgeSelections = selections.filter(
    (selection: KernelSelection): selection is KernelSelection => selection.kind === "edge"
  );
  if (edgeSelections.length === 0) {
    throw new Error("OCCT backend: curve_intersect_no_edges");
  }

  const outputSelection = edgeSelections.length === 1 ? edgeSelections[0] : null;
  const outputs = new Map([
    [
      feature.result,
      outputSelection
        ? {
            id: outputSelection.id,
            kind: "edge" as const,
            meta: { ...outputSelection.meta },
          }
        : {
            id: feature.result,
            kind: "edge" as const,
            meta: {
              shape: outputShape,
              ownerKey: feature.result,
              createdBy: feature.id,
              role: "curve",
              edgeCount: edgeSelections.length,
              featureTags: feature.tags,
            },
          },
    ],
  ]);
  return { outputs, selections };
}
