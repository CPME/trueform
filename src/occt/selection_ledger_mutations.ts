import { hashValue } from "../hash.js";
import type { KernelResult, KernelSelection } from "../backend.js";
import type { SelectionLedgerContext, SelectionLedgerPlan } from "./operation_contexts.js";
import {
  bestFaceMutationFallbackIndex,
  collectGeneratedShapes,
  collectModifiedShapes,
  distancePointToAxis,
  ownerFaceSelectionsForShape,
  radiusMatches,
  selectionRoleForLineage,
  selectionSlotForLineage,
  splitBranchOrdering,
} from "./selection_ledger_common.js";
import { normalizeVector } from "./vector_math.js";

export function makeFaceMutationSelectionLedgerPlan(
  ctx: SelectionLedgerContext,
  upstream: KernelResult,
  ownerShape: unknown,
  replacements: Array<{ from: KernelSelection; to: unknown }>
): SelectionLedgerPlan {
  const ownerFaces = ownerFaceSelectionsForShape(ctx, upstream, ownerShape);
  const replacementSources = new Set(
    replacements
      .map((entry) => entry.from?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );
  return {
    faces: (entries) =>
      annotateFaceMutationSelections(ctx, entries, ownerFaces, replacements, replacementSources),
  };
}

export function makeHoleSelectionLedgerPlan(
  ctx: SelectionLedgerContext,
  upstream: KernelResult,
  ownerShape: unknown,
  target: KernelSelection,
  centers: Array<[number, number, number]>,
  axisDir: [number, number, number],
  opts: {
    radius: number;
    counterboreRadius: number | null;
    countersink: boolean;
  }
): SelectionLedgerPlan {
  const mutationPlan = makeFaceMutationSelectionLedgerPlan(ctx, upstream, ownerShape, []);
  const normalizedAxis = normalizeVector(axisDir);
  return {
    faces: (entries) => {
      mutationPlan.faces?.(entries);
      annotateHoleFaceSelections(ctx, entries, target, centers, normalizedAxis, opts);
    },
  };
}

export function makeDraftSelectionLedgerPlan(
  ctx: SelectionLedgerContext,
  upstream: KernelResult,
  ownerShape: unknown,
  faceTargets: KernelSelection[],
  builder: unknown
): SelectionLedgerPlan {
  const mutationPlan = makeFaceMutationSelectionLedgerPlan(ctx, upstream, ownerShape, []);
  return {
    faces: (entries) => {
      mutationPlan.faces?.(entries);
      annotateDraftFaceSelections(ctx, entries, faceTargets, builder);
    },
  };
}

export function makeEdgeModifierSelectionLedgerPlan(
  ctx: SelectionLedgerContext,
  label: "fillet" | "chamfer",
  upstream: KernelResult,
  ownerShape: unknown,
  edgeTargets: KernelSelection[],
  builder: unknown
): SelectionLedgerPlan {
  const ownerFaces = ownerFaceSelectionsForShape(ctx, upstream, ownerShape);
  const mutationPlan = makeFaceMutationSelectionLedgerPlan(ctx, upstream, ownerShape, []);
  return {
    faces: (entries) => {
      mutationPlan.faces?.(entries);
      annotateModifiedFaceSelections(ctx, entries, ownerFaces, builder);
      annotateEdgeModifierFaceSelections(ctx, entries, label, edgeTargets, builder);
    },
    edges: (entries) => {
      annotateEdgeModifierEdgeSelections(ctx, entries, label, edgeTargets, builder);
    },
  };
}

export function makeSplitFaceSelectionLedgerPlan(
  ctx: SelectionLedgerContext,
  upstream: KernelResult,
  ownerShape: unknown,
  faceTargets: KernelSelection[]
): SelectionLedgerPlan {
  const mutationPlan = makeFaceMutationSelectionLedgerPlan(ctx, upstream, ownerShape, []);
  return {
    faces: (entries) => {
      mutationPlan.faces?.(entries);
      annotateSplitFaceSelections(ctx, entries, faceTargets);
    },
  };
}

export function makeKnitSelectionLedgerPlan(
  ctx: SelectionLedgerContext,
  sourceFaces: KernelSelection[]
): SelectionLedgerPlan {
  const mergedFrom = ctx.uniqueKernelSelectionIds(sourceFaces);
  return {
    solid:
      mergedFrom.length > 0
        ? {
            slot: "body",
            role: "body",
            lineage: { kind: "merged", from: mergedFrom },
          }
        : undefined,
    faces: (entries) => {
      annotateKnitFaceSelections(ctx, entries, sourceFaces, mergedFrom);
    },
  };
}

function annotateFaceMutationSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  ownerFaces: KernelSelection[],
  replacements: Array<{ from: KernelSelection; to: unknown }>,
  replacementSources: Set<string>
): void {
  const unmatched = entries.filter((entry) => !entry.ledger?.slot);

  const applyHint = (
    entry: { shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } },
    sourceSelection: KernelSelection
  ): void => {
    const hint: any = {
      lineage: { kind: "modified", from: sourceSelection.id },
    };
    const slot = selectionSlotForLineage(ctx, sourceSelection);
    if (slot) hint.slot = slot;
    const role = selectionRoleForLineage(ctx, sourceSelection);
    if (role) hint.role = role;
    ctx.applySelectionLedgerHint(entry, hint);
  };

  const applyLineage = (
    targetShape: unknown,
    sourceSelection: KernelSelection,
    allowFallback = false
  ): boolean => {
    for (let i = 0; i < unmatched.length; i += 1) {
      const entry = unmatched[i];
      if (!entry || !ctx.shapesSame(entry.shape, targetShape)) continue;
      applyHint(entry, sourceSelection);
      unmatched.splice(i, 1);
      return true;
    }
    if (!allowFallback) return false;
    const fallbackIndex = bestFaceMutationFallbackIndex(ctx, unmatched, sourceSelection);
    if (fallbackIndex < 0) return false;
    const fallbackEntry = unmatched[fallbackIndex];
    if (!fallbackEntry) return false;
    applyHint(fallbackEntry, sourceSelection);
    unmatched.splice(fallbackIndex, 1);
    return true;
  };

  for (const replacement of replacements) {
    if (!replacement?.from || !replacement.to) continue;
    applyLineage(replacement.to, replacement.from, true);
  }

  for (const sourceSelection of ownerFaces) {
    if (replacementSources.has(sourceSelection.id)) continue;
    const sourceShape = sourceSelection.meta["shape"];
    if (!sourceShape) continue;
    applyLineage(sourceShape, sourceSelection);
  }
}

function annotateHoleFaceSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  target: KernelSelection,
  centers: Array<[number, number, number]>,
  axisDir: [number, number, number],
  opts: {
    radius: number;
    counterboreRadius: number | null;
    countersink: boolean;
  }
): void {
  if (entries.length === 0 || centers.length === 0) return;
  const sourceSlot = selectionSlotForLineage(ctx, target);
  const slotRoot = sourceSlot ? `hole.${sourceSlot}` : "hole.seed";
  const holeTolerance = Math.max(1e-4, opts.radius * 0.1);

  for (const entry of entries) {
    if (entry.ledger?.slot) continue;
    const center = ctx.vectorFingerprint(entry.meta["center"]);
    if (
      center &&
      !centers.some((origin) => distancePointToAxis(ctx, center, origin, axisDir) <= holeTolerance)
    ) {
      continue;
    }

    const surfaceType = entry.meta["surfaceType"];
    if (
      surfaceType === "cylinder" &&
      typeof entry.meta["radius"] === "number" &&
      radiusMatches(ctx, entry.meta["radius"] as number, opts.radius)
    ) {
      ctx.applySelectionLedgerHint(entry, {
        slot: `${slotRoot}.wall`,
        role: "hole",
        lineage: { kind: "modified", from: target.id },
      });
      continue;
    }
    if (
      surfaceType === "cylinder" &&
      opts.counterboreRadius !== null &&
      typeof entry.meta["radius"] === "number" &&
      radiusMatches(ctx, entry.meta["radius"] as number, opts.counterboreRadius)
    ) {
      ctx.applySelectionLedgerHint(entry, {
        slot: `${slotRoot}.counterbore`,
        role: "hole",
        lineage: { kind: "modified", from: target.id },
      });
      continue;
    }
    if (surfaceType === "cone" && opts.countersink) {
      ctx.applySelectionLedgerHint(entry, {
        slot: `${slotRoot}.countersink`,
        role: "hole",
        lineage: { kind: "modified", from: target.id },
      });
    }
  }
}

function annotateDraftFaceSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  faceTargets: KernelSelection[],
  builder: unknown
): void {
  annotateModifiedFaceSelections(ctx, entries, faceTargets, builder);
}

function annotateModifiedFaceSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  faceTargets: KernelSelection[],
  builder: unknown
): void {
  const unmatched = entries.filter((entry) => !entry.ledger?.slot);
  for (const target of faceTargets) {
    const sourceShape = target.meta["shape"];
    if (!sourceShape) continue;
    const modified = collectModifiedShapes(ctx, builder, sourceShape).flatMap((shape) => {
      const faces = ctx.collectFacesFromShape(shape);
      return faces.length > 0 ? faces : [shape];
    });
    if (modified.length === 0) continue;
    const sourceSlot = selectionSlotForLineage(ctx, target);
    const sourceRole = selectionRoleForLineage(ctx, target);
    for (const candidate of modified) {
      const index = unmatched.findIndex((entry) => ctx.shapesSame(entry.shape, candidate));
      if (index < 0) continue;
      const [entry] = unmatched.splice(index, 1);
      if (!entry) continue;
      const hint: any = {
        lineage: { kind: "modified", from: target.id },
      };
      if (sourceSlot) hint.slot = sourceSlot;
      if (sourceRole) hint.role = sourceRole;
      ctx.applySelectionLedgerHint(entry, hint);
      break;
    }
  }
}

function annotateEdgeModifierFaceSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  label: "fillet" | "chamfer",
  edgeTargets: KernelSelection[],
  builder: unknown
): void {
  const unmatched = entries.filter((entry) => !entry.ledger?.slot);
  for (let i = 0; i < edgeTargets.length; i += 1) {
    const target = edgeTargets[i];
    if (!target) continue;
    const sourceShape = target.meta["shape"];
    if (!sourceShape) continue;
    const sourceSlot = selectionSlotForLineage(ctx, target);
    const slotRoot = sourceSlot ? `${label}.${sourceSlot}` : `${label}.seed.${i + 1}`;
    const generated = collectGeneratedShapes(ctx, builder, sourceShape).flatMap((shape) => {
      const faces = ctx.collectFacesFromShape(shape);
      return faces.length > 0 ? faces : [shape];
    });
    if (generated.length === 0) continue;
    let generatedIndex = 0;
    for (const candidate of generated) {
      const index = unmatched.findIndex((entry) => ctx.shapesSame(entry.shape, candidate));
      if (index < 0) continue;
      const [entry] = unmatched.splice(index, 1);
      if (!entry) continue;
      generatedIndex += 1;
      ctx.applySelectionLedgerHint(entry, {
        role: label,
        lineage: { kind: "modified", from: target.id },
        slot: generatedIndex === 1 ? slotRoot : `${slotRoot}.part.${generatedIndex}`,
      });
    }
  }
}

function annotateEdgeModifierEdgeSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  label: "fillet" | "chamfer",
  edgeTargets: KernelSelection[],
  builder: unknown
): void {
  const unmatched = entries.filter((entry) => !entry.ledger?.slot);
  for (let i = 0; i < edgeTargets.length; i += 1) {
    const target = edgeTargets[i];
    if (!target) continue;
    const sourceShape = target.meta["shape"];
    if (!sourceShape) continue;
    const sourceSlot = selectionSlotForLineage(ctx, target);
    const slotRoot = sourceSlot ? `${label}.${sourceSlot}` : `${label}.seed.${i + 1}`;
    const descendantEdges = ctx.uniqueShapeList(
      collectGeneratedShapes(ctx, builder, sourceShape).flatMap((shape) => {
        const faces = ctx.collectFacesFromShape(shape);
        if (faces.length > 0) {
          return faces.flatMap((face) => ctx.collectEdgesFromShape(face));
        }
        const edges = ctx.collectEdgesFromShape(shape);
        return edges.length > 0 ? edges : [shape];
      })
    );
    if (descendantEdges.length === 0) continue;

    const matched: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }> = [];
    for (const candidate of descendantEdges) {
      const index = unmatched.findIndex((entry) => ctx.shapesSame(entry.shape, candidate));
      if (index < 0) continue;
      const [entry] = unmatched.splice(index, 1);
      if (!entry) continue;
      matched.push(entry);
    }
    if (matched.length === 0) continue;

    matched.sort((a, b) => {
      const aSlot = edgeModifierDerivedEdgeSlot(a, label, slotRoot) ?? "";
      const bSlot = edgeModifierDerivedEdgeSlot(b, label, slotRoot) ?? "";
      const bySlot = aSlot.localeCompare(bSlot);
      if (bySlot !== 0) return bySlot;
      const aTie = hashValue(ctx.selectionTieBreakerFingerprint("edge", a.meta));
      const bTie = hashValue(ctx.selectionTieBreakerFingerprint("edge", b.meta));
      const byTie = aTie.localeCompare(bTie);
      if (byTie !== 0) return byTie;
      return ctx.shapeHash(a.shape) - ctx.shapeHash(b.shape);
    });

    const slotCounts = new Map<string, number>();
    for (const entry of matched) {
      const slot = edgeModifierDerivedEdgeSlot(entry, label, slotRoot);
      if (!slot) continue;
      slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
    }
    const slotIndexes = new Map<string, number>();
    for (let edgeIndex = 0; edgeIndex < matched.length; edgeIndex += 1) {
      const entry = matched[edgeIndex];
      if (!entry) continue;
      let slot = edgeModifierDerivedEdgeSlot(entry, label, slotRoot) ?? `${slotRoot}.edge.${edgeIndex + 1}`;
      const duplicateCount = slotCounts.get(slot) ?? 0;
      if (slot.endsWith(".end")) {
        const index = (slotIndexes.get(slot) ?? 0) + 1;
        slotIndexes.set(slot, index);
        slot = `${slot}.${index}`;
      } else if (duplicateCount > 1) {
        const index = (slotIndexes.get(slot) ?? 0) + 1;
        slotIndexes.set(slot, index);
        slot = `${slot}.part.${index}`;
      }
      ctx.applySelectionLedgerHint(entry, {
        role: "edge",
        lineage: { kind: "modified", from: target.id },
        slot,
      });
    }
  }
}

function edgeModifierDerivedEdgeSlot(
  entry: { meta: Record<string, unknown> },
  label: "fillet" | "chamfer",
  slotRoot: string
): string | null {
  const adjacentSlots = Array.isArray(entry.meta["adjacentFaceSlots"])
    ? (entry.meta["adjacentFaceSlots"] as unknown[])
        .filter((slot): slot is string => typeof slot === "string" && slot.trim().length > 0)
        .map((slot) => slot.trim())
    : [];
  if (adjacentSlots.length === 0) return null;
  const descendantSlots = adjacentSlots.filter(
    (slot) => slot === slotRoot || slot.startsWith(`${slotRoot}.part.`)
  );
  if (descendantSlots.length === 0) return null;
  const neighborSlots = adjacentSlots.filter(
    (slot) => !(slot === slotRoot || slot.startsWith(`${slotRoot}.part.`))
  );
  if (neighborSlots.length === 1) {
    const neighborSlot = neighborSlots[0];
    if (!neighborSlot) return null;
    if (neighborSlot.startsWith(`${label}.`)) {
      return `${slotRoot}.join.${neighborSlot}`;
    }
    return `${slotRoot}.bound.${neighborSlot}`;
  }

  const adjacentIds = Array.isArray(entry.meta["adjacentFaceIds"])
    ? (entry.meta["adjacentFaceIds"] as unknown[]).filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    : [];
  if (neighborSlots.length === 0 && descendantSlots.length > 0) {
    if (adjacentIds.length <= 1) {
      return `${slotRoot}.seam`;
    }
    return `${slotRoot}.end`;
  }
  if (neighborSlots.length > 1) {
    return `${slotRoot}.end`;
  }
  return null;
}

function annotateSplitFaceSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  faceTargets: KernelSelection[]
): void {
  const remaining = entries.filter((entry) => !entry.ledger?.slot);
  for (let i = 0; i < faceTargets.length; i += 1) {
    const target = faceTargets[i];
    if (!target) continue;
    const sourceSlot = selectionSlotForLineage(ctx, target);
    const slotRoot = sourceSlot ? `split.${sourceSlot}` : `split.seed.${i + 1}`;
    const sourceRole = selectionRoleForLineage(ctx, target);
    const ranked = remaining
      .map((entry) => ({
        entry,
        ordering: splitBranchOrdering(ctx, entry, target),
      }))
      .filter(
        (
          candidate
        ): candidate is {
          entry: { shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } };
          ordering: [number, number, number];
        } => candidate.ordering !== null
      )
      .sort((a, b) => {
        const byX = a.ordering[0] - b.ordering[0];
        if (Math.abs(byX) > 1e-9) return byX;
        const byY = a.ordering[1] - b.ordering[1];
        if (Math.abs(byY) > 1e-9) return byY;
        const byZ = a.ordering[2] - b.ordering[2];
        if (Math.abs(byZ) > 1e-9) return byZ;
        return 0;
      });
    for (let branchIndex = 0; branchIndex < ranked.length; branchIndex += 1) {
      const current = ranked[branchIndex];
      if (!current) continue;
      const remainingIndex = remaining.indexOf(current.entry);
      if (remainingIndex >= 0) {
        remaining.splice(remainingIndex, 1);
      }
      const hint: any = {
        slot: `${slotRoot}.branch.${branchIndex + 1}`,
        lineage: {
          kind: "split",
          from: target.id,
          branch: `${branchIndex + 1}`,
        },
      };
      if (sourceRole) {
        hint.role = sourceRole;
      }
      ctx.applySelectionLedgerHint(current.entry, hint);
    }
  }
}

function annotateKnitFaceSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  sourceFaces: KernelSelection[],
  mergedFrom: string[]
): void {
  const unmatched = entries.filter((entry) => !entry.ledger?.slot);
  for (let i = 0; i < sourceFaces.length; i += 1) {
    const source = sourceFaces[i];
    if (!source) continue;
    const sourceShape = source.meta["shape"];
    if (!sourceShape) continue;
    let index = unmatched.findIndex((entry) => ctx.shapesSame(entry.shape, sourceShape));
    if (index < 0) {
      index = bestFaceMutationFallbackIndex(ctx, unmatched, source);
    }
    if (index < 0) continue;
    const [entry] = unmatched.splice(index, 1);
    if (!entry) continue;
    const sourceSlot = selectionSlotForLineage(ctx, source);
    const sourceRole = selectionRoleForLineage(ctx, source);
    const slot = sourceSlot ? `merge.part.${i + 1}.${sourceSlot}` : `merge.part.${i + 1}`;
    ctx.applySelectionLedgerHint(entry, {
      slot,
      role: sourceRole ?? "surface",
      lineage: { kind: "merged", from: [source.id] },
    });
  }

  unmatched.sort((a, b) => {
    const aTie = hashValue(ctx.selectionTieBreakerFingerprint("face", a.meta));
    const bTie = hashValue(ctx.selectionTieBreakerFingerprint("face", b.meta));
    const byTie = aTie.localeCompare(bTie);
    if (byTie !== 0) return byTie;
    return ctx.shapeHash(a.shape) - ctx.shapeHash(b.shape);
  });
  for (let i = 0; i < unmatched.length; i += 1) {
    const entry = unmatched[i];
    if (!entry) continue;
    ctx.applySelectionLedgerHint(entry, {
      slot: `merge.generated.${i + 1}`,
      role: "surface",
      lineage: {
        kind: "merged",
        from: mergedFrom.length > 0 ? mergedFrom : sourceFaces.map((source) => source.id),
      },
    });
  }
}
