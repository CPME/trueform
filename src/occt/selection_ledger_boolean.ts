import { hashValue } from "../hash.js";
import { describeBooleanSemanticEdge } from "../selection_semantics.js";
import type { KernelResult, KernelSelection } from "../backend.js";
import type { SelectionLedgerContext, SelectionLedgerPlan } from "./operation_contexts.js";
import {
  bestFaceMutationFallbackIndex,
  collectGeneratedShapes,
  collectModifiedShapes,
  ownerFaceSelectionsForShape,
  selectionRoleForLineage,
  selectionSlotForLineage,
  splitBranchOrdering,
} from "./selection_ledger_common.js";

export function makeBooleanSelectionLedgerPlan(
  ctx: SelectionLedgerContext,
  op: "union" | "subtract" | "intersect",
  upstream: KernelResult,
  leftShape: unknown,
  rightShape: unknown,
  builder: unknown
): SelectionLedgerPlan {
  const leftPlan = makeFaceMutationSelectionLedgerPlan(ctx, upstream, leftShape, []);
  const leftFaces =
    op === "subtract" || op === "intersect"
      ? ownerFaceSelectionsForShape(ctx, upstream, leftShape)
      : [];
  const rightPlan =
    op === "subtract" || op === "union"
      ? null
      : makeFaceMutationSelectionLedgerPlan(ctx, upstream, rightShape, []);
  const rightFaces =
    op === "subtract" || op === "intersect" || op === "union"
      ? ownerFaceSelectionsForShape(ctx, upstream, rightShape)
      : [];
  return {
    faces: (entries) => {
      leftPlan.faces?.(entries);
      rightPlan?.faces?.(entries);
      if (op === "subtract") {
        annotateBooleanCutFaceSelections(ctx, entries, rightFaces, builder);
        annotateBooleanPreservedFaceSelections(ctx, entries, leftFaces, builder);
      } else if (op === "union") {
        annotateBooleanUnionFaceSelections(ctx, entries, rightFaces, builder);
      } else if (op === "intersect") {
        annotateBooleanPreservedFaceSelections(ctx, entries, leftFaces, builder);
        annotateBooleanPreservedFaceSelections(ctx, entries, rightFaces, builder);
      }
    },
    edges:
      op === "subtract"
        ? (entries) => {
            annotateBooleanCutEdgeSelections(ctx, entries);
          }
        : op === "union" || op === "intersect"
          ? (entries) => {
              annotateBooleanSemanticEdgeSelections(ctx, entries);
            }
          : undefined,
  };
}

function makeFaceMutationSelectionLedgerPlan(
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

function annotateBooleanUnionFaceSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  sourceFaces: KernelSelection[],
  builder: unknown
): void {
  const remaining = entries.filter((entry) => !entry.ledger?.slot);
  for (let i = 0; i < sourceFaces.length; i += 1) {
    const source = sourceFaces[i];
    if (!source) continue;
    const sourceShape = source.meta["shape"];
    if (!sourceShape) continue;
    const candidates = ctx.uniqueShapeList([
      sourceShape,
      ...collectModifiedShapes(ctx, builder, sourceShape).flatMap((shape) => {
        const faces = ctx.collectFacesFromShape(shape);
        return faces.length > 0 ? faces : [shape];
      }),
    ]);
    const matched: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }> = [];
    for (const candidate of candidates) {
      const index = remaining.findIndex((entry) => ctx.shapesSame(entry.shape, candidate));
      if (index < 0) continue;
      const [entry] = remaining.splice(index, 1);
      if (!entry) continue;
      matched.push(entry);
    }
    if (matched.length === 0) continue;
    assignBooleanUnionFaceMatches(ctx, entries, matched, source);
  }
}

function assignBooleanUnionFaceMatches(
  ctx: SelectionLedgerContext,
  allEntries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  matches: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  source: KernelSelection
): void {
  if (matches.length === 0) return;
  const sourceSlot = selectionSlotForLineage(ctx, source);
  const sourceRole = selectionRoleForLineage(ctx, source);
  const existingSlots = new Set(
    allEntries
      .map((entry) => entry.ledger?.slot)
      .filter((slot): slot is string => typeof slot === "string" && slot.length > 0)
  );
  const baseSlot = sourceSlot
    ? existingSlots.has(sourceSlot)
      ? `right.${sourceSlot}`
      : sourceSlot
    : undefined;

  if (matches.length === 1) {
    const [entry] = matches;
    if (!entry) return;
    const hint: any = {
      lineage: { kind: "modified", from: source.id },
    };
    if (baseSlot) hint.slot = baseSlot;
    if (sourceRole) hint.role = sourceRole;
    ctx.applySelectionLedgerHint(entry, hint);
    return;
  }

  const slotRoot = baseSlot ? `split.${baseSlot}` : "split.right.seed";
  for (let branchIndex = 0; branchIndex < matches.length; branchIndex += 1) {
    const entry = matches[branchIndex];
    if (!entry) continue;
    const hint: any = {
      slot: `${slotRoot}.branch.${branchIndex + 1}`,
      lineage: {
        kind: "split",
        from: source.id,
        branch: `${branchIndex + 1}`,
      },
    };
    if (sourceRole) {
      hint.role = sourceRole;
    }
    ctx.applySelectionLedgerHint(entry, hint);
  }
}

function annotateBooleanPreservedFaceSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  sourceFaces: KernelSelection[],
  builder: unknown
): void {
  const remaining = entries.filter((entry) => !entry.ledger?.slot);
  for (let i = 0; i < sourceFaces.length; i += 1) {
    const source = sourceFaces[i];
    if (!source) continue;
    const sourceShape = source.meta["shape"];
    if (!sourceShape) continue;

    const matched = ctx.uniqueShapeList([
      sourceShape,
      ...collectModifiedShapes(ctx, builder, sourceShape).flatMap((shape) => {
        const faces = ctx.collectFacesFromShape(shape);
        return faces.length > 0 ? faces : [shape];
      }),
    ]);
    const exactMatches: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }> = [];
    for (const candidate of matched) {
      const index = remaining.findIndex((entry) => ctx.shapesSame(entry.shape, candidate));
      if (index < 0) continue;
      const [entry] = remaining.splice(index, 1);
      if (!entry) continue;
      exactMatches.push(entry);
    }
    if (exactMatches.length > 0) {
      assignBooleanPreservedFaceMatches(ctx, exactMatches, source);
      continue;
    }

    const ranked = remaining
      .map((entry) => ({
        entry,
        ordering: splitBranchOrdering(ctx, entry, source),
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
    if (ranked.length === 0) continue;
    const matches = ranked.map((candidate) => candidate.entry);
    for (const entry of matches) {
      const index = remaining.indexOf(entry);
      if (index >= 0) remaining.splice(index, 1);
    }
    assignBooleanPreservedFaceMatches(ctx, matches, source);
  }
}

function assignBooleanPreservedFaceMatches(
  ctx: SelectionLedgerContext,
  matches: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  source: KernelSelection
): void {
  if (matches.length === 0) return;
  const sourceSlot = selectionSlotForLineage(ctx, source);
  const sourceRole = selectionRoleForLineage(ctx, source);
  if (matches.length === 1) {
    const [entry] = matches;
    if (!entry) return;
    const hint: any = {
      lineage: { kind: "modified", from: source.id },
    };
    if (sourceSlot) hint.slot = sourceSlot;
    if (sourceRole) hint.role = sourceRole;
    ctx.applySelectionLedgerHint(entry, hint);
    return;
  }

  const slotRoot = sourceSlot ? `split.${sourceSlot}` : "split.seed";
  for (let branchIndex = 0; branchIndex < matches.length; branchIndex += 1) {
    const entry = matches[branchIndex];
    if (!entry) continue;
    const hint: any = {
      slot: `${slotRoot}.branch.${branchIndex + 1}`,
      lineage: {
        kind: "split",
        from: source.id,
        branch: `${branchIndex + 1}`,
      },
    };
    if (sourceRole) {
      hint.role = sourceRole;
    }
    ctx.applySelectionLedgerHint(entry, hint);
  }
}

function annotateBooleanCutFaceSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>,
  toolFaces: KernelSelection[],
  builder: unknown
): void {
  const unmatched = entries.filter((entry) => !entry.ledger?.slot);
  for (let i = 0; i < toolFaces.length; i += 1) {
    const target = toolFaces[i];
    if (!target) continue;
    const sourceShape = target.meta["shape"];
    if (!sourceShape) continue;
    const sourceSlot = selectionSlotForLineage(ctx, target);
    const slotRoot = sourceSlot ? `cut.${sourceSlot}` : `cut.seed.${i + 1}`;
    const candidates = ctx.uniqueShapeList([
      sourceShape,
      ...collectModifiedShapes(ctx, builder, sourceShape).flatMap((shape) => {
        const faces = ctx.collectFacesFromShape(shape);
        return faces.length > 0 ? faces : [shape];
      }),
      ...collectGeneratedShapes(ctx, builder, sourceShape).flatMap((shape) => {
        const faces = ctx.collectFacesFromShape(shape);
        return faces.length > 0 ? faces : [shape];
      }),
    ]);
    let generatedIndex = 0;
    for (const candidate of candidates) {
      const index = unmatched.findIndex((entry) => ctx.shapesSame(entry.shape, candidate));
      if (index < 0) continue;
      const [entry] = unmatched.splice(index, 1);
      if (!entry) continue;
      generatedIndex += 1;
      ctx.applySelectionLedgerHint(entry, {
        role: "cut",
        lineage: { kind: "modified", from: target.id },
        slot: generatedIndex === 1 ? slotRoot : `${slotRoot}.part.${generatedIndex}`,
      });
    }
    if (generatedIndex > 0) continue;
    if (selectionRoleForLineage(ctx, target) !== "side") continue;
    const fallbackIndex = bestFaceMutationFallbackIndex(ctx, unmatched, target);
    if (fallbackIndex < 0) continue;
    const [fallback] = unmatched.splice(fallbackIndex, 1);
    if (!fallback) continue;
    ctx.applySelectionLedgerHint(fallback, {
      role: "cut",
      lineage: { kind: "modified", from: target.id },
      slot: slotRoot,
    });
  }
}

function annotateBooleanCutEdgeSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>
): void {
  const unmatched = entries.filter((entry) => !entry.ledger?.slot);
  const matched = unmatched.filter((entry) => booleanCutDerivedEdgeSlot(entry) !== null);
  if (matched.length === 0) return;

  matched.sort((a, b) => {
    const aSlot = booleanCutDerivedEdgeSlot(a) ?? "";
    const bSlot = booleanCutDerivedEdgeSlot(b) ?? "";
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
    const slot = booleanCutDerivedEdgeSlot(entry);
    if (!slot) continue;
    slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
  }
  const slotIndexes = new Map<string, number>();
  for (const entry of matched) {
    let slot = booleanCutDerivedEdgeSlot(entry);
    if (!slot) continue;
    const duplicateCount = slotCounts.get(slot) ?? 0;
    if (duplicateCount > 1) {
      const index = (slotIndexes.get(slot) ?? 0) + 1;
      slotIndexes.set(slot, index);
      slot = `${slot}.part.${index}`;
    }
    ctx.applySelectionLedgerHint(entry, {
      role: "edge",
      lineage: { kind: "created" },
      slot,
    });
  }
}

function annotateBooleanSemanticEdgeSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } }>
): void {
  const unmatched = entries.filter((entry) => !entry.ledger?.slot);
  const matched = unmatched
    .map((entry) => ({
      entry,
      descriptor: describeBooleanSemanticEdge(entry.meta["adjacentFaceSlots"]),
    }))
    .filter(
      (
        candidate
      ): candidate is {
        entry: { shape: unknown; meta: Record<string, unknown>; ledger?: { slot?: string } };
        descriptor: NonNullable<ReturnType<typeof describeBooleanSemanticEdge>>;
      } => candidate.descriptor !== null
    );
  if (matched.length === 0) return;

  matched.sort((a, b) => {
    const bySlot = a.descriptor.slot.localeCompare(b.descriptor.slot);
    if (bySlot !== 0) return bySlot;
    const bySignature = a.descriptor.signature.localeCompare(b.descriptor.signature);
    if (bySignature !== 0) return bySignature;
    const aTie = hashValue(ctx.selectionTieBreakerFingerprint("edge", a.entry.meta));
    const bTie = hashValue(ctx.selectionTieBreakerFingerprint("edge", b.entry.meta));
    const byTie = aTie.localeCompare(bTie);
    if (byTie !== 0) return byTie;
    return ctx.shapeHash(a.entry.shape) - ctx.shapeHash(b.entry.shape);
  });

  const slotCounts = new Map<string, number>();
  for (const candidate of matched) {
    const slot = candidate.descriptor.slot;
    slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
  }
  const slotIndexes = new Map<string, number>();
  for (const candidate of matched) {
    let slot = candidate.descriptor.slot;
    const duplicateCount = slotCounts.get(slot) ?? 0;
    if (duplicateCount > 1) {
      const index = (slotIndexes.get(slot) ?? 0) + 1;
      slotIndexes.set(slot, index);
      slot = `${slot}.part.${index}`;
    }
    ctx.applySelectionLedgerHint(candidate.entry, {
      role: "edge",
      slot,
      signature: candidate.descriptor.signature,
      provenance: candidate.descriptor.provenance,
    });
  }
}

function booleanCutDerivedEdgeSlot(entry: { meta: Record<string, unknown> }): string | null {
  const adjacentSlots = Array.isArray(entry.meta["adjacentFaceSlots"])
    ? (entry.meta["adjacentFaceSlots"] as unknown[])
        .filter((slot): slot is string => typeof slot === "string" && slot.trim().length > 0)
        .map((slot) => slot.trim())
    : [];
  if (adjacentSlots.length === 0) return null;

  const cutSlots = adjacentSlots
    .filter((slot) => slot === "cut" || slot.startsWith("cut."))
    .slice()
    .sort();
  const otherSlots = adjacentSlots
    .filter((slot) => !(slot === "cut" || slot.startsWith("cut.")))
    .slice()
    .sort();

  if (cutSlots.length === 1 && otherSlots.length === 1) {
    return `${cutSlots[0]}.bound.${otherSlots[0]}`;
  }
  if (cutSlots.length === 2 && otherSlots.length === 0) {
    const [root, target] = cutSlots;
    if (!root || !target) return null;
    return `${root}.join.${target}`;
  }
  return null;
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
