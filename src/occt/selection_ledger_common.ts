import type { KernelResult, KernelSelection } from "../backend.js";
import { cross, dot, normalizeVector, vecLength } from "./vector_math.js";
import type { SelectionLedgerContext } from "./operation_contexts.js";

export function ownerFaceSelectionsForShape(
  ctx: SelectionLedgerContext,
  upstream: KernelResult,
  ownerShape: unknown
): KernelSelection[] {
  return upstream.selections.filter(
    (selection): selection is KernelSelection =>
      selection.kind === "face" &&
      !!selection.meta["owner"] &&
      ctx.shapesSame(selection.meta["owner"], ownerShape)
  );
}

export function selectionSlotForLineage(
  _ctx: SelectionLedgerContext,
  selection: KernelSelection
): string | undefined {
  if (typeof selection.record?.slot === "string" && selection.record.slot.trim().length > 0) {
    return selection.record.slot.trim();
  }
  const metaSlot = selection.meta["selectionSlot"];
  if (typeof metaSlot === "string" && metaSlot.trim().length > 0) {
    return metaSlot.trim();
  }
  return undefined;
}

export function selectionRoleForLineage(
  _ctx: SelectionLedgerContext,
  selection: KernelSelection
): string | undefined {
  if (typeof selection.record?.role === "string" && selection.record.role.trim().length > 0) {
    return selection.record.role.trim();
  }
  const metaRole = selection.meta["role"];
  if (typeof metaRole === "string" && metaRole.trim().length > 0) {
    return metaRole.trim();
  }
  return undefined;
}

export function radiusMatches(
  _ctx: SelectionLedgerContext,
  actual: number,
  expected: number
): boolean {
  const tolerance = Math.max(1e-4, Math.abs(expected) * 1e-4);
  return Math.abs(actual - expected) <= tolerance;
}

export function distancePointToAxis(
  ctx: SelectionLedgerContext,
  point: [number, number, number],
  origin: [number, number, number],
  axisDir: [number, number, number]
): number {
  const relative = ctx.subVec(point, origin);
  const projection = ctx.scaleVec(axisDir, dot(relative, axisDir));
  return vecLength(ctx.subVec(relative, projection));
}

export function splitBranchOrdering(
  ctx: SelectionLedgerContext,
  entry: { meta: Record<string, unknown> },
  sourceSelection: KernelSelection
): [number, number, number] | null {
  const sourceMeta = sourceSelection.meta;
  const sourceSurfaceType =
    typeof sourceMeta["surfaceType"] === "string"
      ? (sourceMeta["surfaceType"] as string)
      : null;
  const entrySurfaceType =
    typeof entry.meta["surfaceType"] === "string" ? (entry.meta["surfaceType"] as string) : null;
  if (sourceSurfaceType && entrySurfaceType && sourceSurfaceType !== entrySurfaceType) {
    return null;
  }

  const sourcePlanar =
    typeof sourceMeta["planar"] === "boolean" ? (sourceMeta["planar"] as boolean) : null;
  const entryPlanar = typeof entry.meta["planar"] === "boolean" ? (entry.meta["planar"] as boolean) : null;
  if (sourcePlanar !== null && entryPlanar !== null && sourcePlanar !== entryPlanar) {
    return null;
  }

  const sourceNormal = ctx.vectorFingerprint(sourceMeta["planeNormal"] ?? sourceMeta["normalVec"]);
  const entryNormal = ctx.vectorFingerprint(entry.meta["planeNormal"] ?? entry.meta["normalVec"]);
  if (sourceNormal && entryNormal) {
    const sourceNormalUnit = normalizeVector(sourceNormal);
    const entryNormalUnit = normalizeVector(entryNormal);
    if (Math.abs(dot(sourceNormalUnit, entryNormalUnit)) < 0.999) {
      return null;
    }
  }

  const sourcePlaneOrigin = ctx.vectorFingerprint(sourceMeta["planeOrigin"]);
  const entryPlaneOrigin = ctx.vectorFingerprint(entry.meta["planeOrigin"]);
  if (sourcePlaneOrigin && entryPlaneOrigin && sourceNormal) {
    const delta = ctx.subVec(entryPlaneOrigin, sourcePlaneOrigin);
    if (Math.abs(dot(delta, normalizeVector(sourceNormal))) > 1e-4) {
      return null;
    }
  }

  const center = ctx.vectorFingerprint(entry.meta["center"]);
  if (!center) return null;

  const origin = sourcePlaneOrigin ?? ctx.vectorFingerprint(sourceMeta["center"]) ?? [0, 0, 0];
  const normal =
    ctx.vectorFingerprint(sourceMeta["planeNormal"] ?? sourceMeta["normalVec"]) ?? [0, 0, 1];
  const xSeed = ctx.vectorFingerprint(sourceMeta["planeXDir"]) ?? ctx.defaultAxisForNormal(normal);
  const xDir = normalizeVector(xSeed);
  const ySeed = ctx.vectorFingerprint(sourceMeta["planeYDir"]) ?? cross(normalizeVector(normal), xDir);
  const yDir = normalizeVector(ySeed);
  const relative = ctx.subVec(center, origin);
  const x = dot(relative, xDir);
  const y = dot(relative, yDir);
  const z = typeof entry.meta["centerZ"] === "number" ? (entry.meta["centerZ"] as number) : center[2];
  return [x, y, z];
}

export function bestFaceMutationFallbackIndex(
  ctx: SelectionLedgerContext,
  entries: Array<{ meta: Record<string, unknown> }>,
  sourceSelection: KernelSelection
): number {
  if (entries.length === 0) return -1;
  const sourceMeta = sourceSelection.meta;
  const sourceNormal = typeof sourceMeta["normal"] === "string" ? (sourceMeta["normal"] as string) : null;
  const sourceSurfaceType =
    typeof sourceMeta["surfaceType"] === "string"
      ? (sourceMeta["surfaceType"] as string)
      : null;
  const sourcePlanar = typeof sourceMeta["planar"] === "boolean" ? (sourceMeta["planar"] as boolean) : null;
  const sourceArea = typeof sourceMeta["area"] === "number" ? (sourceMeta["area"] as number) : null;
  const sourceCenter = ctx.vectorFingerprint(sourceMeta["center"]);

  const candidates = entries
    .map((entry, index) => {
      if (
        sourceNormal &&
        typeof entry.meta["normal"] === "string" &&
        entry.meta["normal"] !== sourceNormal
      ) {
        return null;
      }
      if (
        sourceSurfaceType &&
        typeof entry.meta["surfaceType"] === "string" &&
        entry.meta["surfaceType"] !== sourceSurfaceType
      ) {
        return null;
      }
      if (
        sourcePlanar !== null &&
        typeof entry.meta["planar"] === "boolean" &&
        entry.meta["planar"] !== sourcePlanar
      ) {
        return null;
      }

      const area = typeof entry.meta["area"] === "number" ? (entry.meta["area"] as number) : null;
      const center = ctx.vectorFingerprint(entry.meta["center"]);
      const areaDelta =
        sourceArea !== null && area !== null ? Math.abs(area - sourceArea) : Number.POSITIVE_INFINITY;
      const centerDelta =
        sourceCenter && center
          ? Math.hypot(
              sourceCenter[0] - center[0],
              sourceCenter[1] - center[1],
              sourceCenter[2] - center[2]
            )
          : Number.POSITIVE_INFINITY;
      return { index, areaDelta, centerDelta };
    })
    .filter(
      (
        candidate
      ): candidate is { index: number; areaDelta: number; centerDelta: number } => candidate !== null
    );

  if (candidates.length === 0) return -1;
  candidates.sort((a, b) => {
    const byArea = a.areaDelta - b.areaDelta;
    if (Math.abs(byArea) > 1e-9) return byArea;
    const byCenter = a.centerDelta - b.centerDelta;
    if (Math.abs(byCenter) > 1e-9) return byCenter;
    return a.index - b.index;
  });
  return candidates[0]?.index ?? -1;
}

export function collectWireEdgesInOrder(ctx: SelectionLedgerContext, wire: unknown): unknown[] {
  const occt = ctx.occt as any;
  const edges: unknown[] = [];
  const explorer = new occt.TopExp_Explorer_1();
  explorer.Init(
    ctx.toWire(wire),
    occt.TopAbs_ShapeEnum.TopAbs_EDGE,
    occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  for (; explorer.More(); explorer.Next()) {
    edges.push(explorer.Current());
  }
  return edges;
}

export function collectGeneratedShapes(
  ctx: SelectionLedgerContext,
  builder: unknown,
  source: unknown
): unknown[] {
  return collectHistoryShapes(ctx, builder, ["Generated", "Generated_1"], source);
}

export function collectModifiedShapes(
  ctx: SelectionLedgerContext,
  builder: unknown,
  source: unknown
): unknown[] {
  return collectHistoryShapes(ctx, builder, ["Modified", "Modified_1"], source);
}

export function applyGeneratedDerivedFaceSlots(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown> }>,
  builder: unknown,
  wire: unknown,
  wireSegmentSlots: string[],
  slotPrefix: string
): boolean {
  const wireEdges = collectWireEdgesInOrder(ctx, wire);
  if (wireEdges.length === 0 || wireEdges.length !== wireSegmentSlots.length) {
    return false;
  }

  const remaining = entries.slice();
  let assigned = 0;
  for (let i = 0; i < wireEdges.length; i += 1) {
    const sourceEdge = wireEdges[i];
    const segmentSlot = wireSegmentSlots[i];
    if (!sourceEdge || typeof segmentSlot !== "string" || segmentSlot.trim().length === 0) {
      continue;
    }
    const generated = collectGeneratedShapes(ctx, builder, sourceEdge).flatMap((shape) => {
      const faces = ctx.collectFacesFromShape(shape);
      return faces.length > 0 ? faces : [shape];
    });
    const face = generated.find((candidate) =>
      remaining.some((entry) => ctx.shapesSame(entry.shape, candidate))
    );
    if (!face) continue;
    const index = remaining.findIndex((entry) => ctx.shapesSame(entry.shape, face));
    if (index < 0) continue;
    const [entry] = remaining.splice(index, 1);
    if (!entry) continue;
    ctx.applySelectionLedgerHint(entry, {
      slot: `${slotPrefix}.${segmentSlot.trim()}`,
      role: slotPrefix,
      lineage: { kind: "created" },
    });
    assigned += 1;
  }

  if (assigned === 0) {
    return false;
  }

  for (let i = 0; i < remaining.length; i += 1) {
    const entry = remaining[i];
    if (!entry) continue;
    ctx.applySelectionLedgerHint(entry, {
      slot: `${slotPrefix}.fallback.${i + 1}`,
      role: slotPrefix,
      lineage: { kind: "created" },
    });
  }
  return true;
}

function collectHistoryShapes(
  ctx: SelectionLedgerContext,
  builder: unknown,
  methodNames: string[],
  source: unknown
): unknown[] {
  let generated: any;
  try {
    generated = ctx.callWithFallback(builder, methodNames, [[source]]);
  } catch {
    return [];
  }
  if (!generated) return [];
  if (typeof generated.Size === "function") {
    return drainShapeList(ctx, generated);
  }
  return [generated];
}

function drainShapeList(ctx: SelectionLedgerContext, list: any): unknown[] {
  const shapes: unknown[] = [];
  let size = readShapeListSize(ctx, list);
  let guard = 0;
  while (size > 0 && guard < 1024) {
    let first: any;
    try {
      first = ctx.callWithFallback(list, ["First_1", "First_2", "First"], [[], []]);
    } catch {
      break;
    }
    if (first) {
      shapes.push(first);
    }
    try {
      ctx.callWithFallback(list, ["RemoveFirst", "RemoveFirst_1"], [[], []]);
    } catch {
      break;
    }
    size = readShapeListSize(ctx, list);
    guard += 1;
  }
  return shapes;
}

function readShapeListSize(ctx: SelectionLedgerContext, list: any): number {
  try {
    const size = ctx.callWithFallback(list, ["Size", "Size_1"], [[], []]);
    return typeof size === "number" && Number.isFinite(size) ? size : 0;
  } catch {
    return 0;
  }
}
