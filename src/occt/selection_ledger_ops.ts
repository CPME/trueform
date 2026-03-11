import { hashValue } from "../hash.js";
import { describeBooleanSemanticEdge } from "../selection_semantics.js";
import type { KernelResult, KernelSelection } from "../backend.js";
import { cross, dot, isFiniteVec, normalizeVector, vecLength } from "./vector_math.js";
export function makePrismSelectionLedgerPlan(ctx: any, 
    axis: [number, number, number],
    opts?: {
      prism?: any;
      wire?: any;
      wireSegmentSlots?: string[];
    }
  ): any {
    const normalizedAxis = normalizeVector(axis);
    if (!isFiniteVec(normalizedAxis)) {
      return {};
    }
    return {
      faces: (entries: any[]) =>
        annotatePrismFaceSelections(ctx, entries, normalizedAxis, {
          prism: opts?.prism,
          wire: opts?.wire,
          wireSegmentSlots: opts?.wireSegmentSlots,
        }),
    };
  }

export function makeRevolveSelectionLedgerPlan(ctx: any, 
    angleRad: number,
    opts: {
      revol: any;
      wire: any;
      wireSegmentSlots: string[];
    }
  ): any {
    return {
      faces: (entries: any[]) =>
        annotateRevolveFaceSelections(ctx, entries, angleRad, {
          revol: opts.revol,
          wire: opts.wire,
          wireSegmentSlots: opts.wireSegmentSlots,
        }),
    };
  }

export function makeFaceMutationSelectionLedgerPlan(ctx: any, 
    upstream: KernelResult,
    ownerShape: any,
    replacements: Array<{ from: KernelSelection; to: any }>
  ): any {
    const ownerFaces = ownerFaceSelectionsForShape(ctx, upstream, ownerShape);
    const replacementSources = new Set(
      replacements
        .map((entry) => entry.from?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );
    return {
      faces: (entries: any[]) =>
        annotateFaceMutationSelections(ctx, entries, ownerFaces, replacements, replacementSources),
    };
  }

export function makeHoleSelectionLedgerPlan(ctx: any, 
    upstream: KernelResult,
    ownerShape: any,
    target: KernelSelection,
    centers: Array<[number, number, number]>,
    axisDir: [number, number, number],
    opts: {
      radius: number;
      counterboreRadius: number | null;
      countersink: boolean;
    }
  ): any {
    const mutationPlan = makeFaceMutationSelectionLedgerPlan(ctx, upstream, ownerShape, []);
    const normalizedAxis = normalizeVector(axisDir);
    return {
      faces: (entries: any[]) => {
        mutationPlan.faces?.(entries);
        if (!isFiniteVec(normalizedAxis)) return;
        annotateHoleFaceSelections(ctx, entries, target, centers, normalizedAxis, opts);
      },
    };
  }

export function makeDraftSelectionLedgerPlan(ctx: any, 
    upstream: KernelResult,
    ownerShape: any,
    faceTargets: KernelSelection[],
    builder: any
  ): any {
    const mutationPlan = makeFaceMutationSelectionLedgerPlan(ctx, upstream, ownerShape, []);
    return {
      faces: (entries: any[]) => {
        mutationPlan.faces?.(entries);
        annotateDraftFaceSelections(ctx, entries, faceTargets, builder);
      },
    };
  }

export function makeEdgeModifierSelectionLedgerPlan(ctx: any, 
    label: "fillet" | "chamfer",
    upstream: KernelResult,
    ownerShape: any,
    edgeTargets: KernelSelection[],
    builder: any
  ): any {
    const ownerFaces = ownerFaceSelectionsForShape(ctx, upstream, ownerShape);
    const mutationPlan = makeFaceMutationSelectionLedgerPlan(ctx, upstream, ownerShape, []);
    return {
      faces: (entries: any[]) => {
        mutationPlan.faces?.(entries);
        annotateModifiedFaceSelections(ctx, entries, ownerFaces, builder);
        annotateEdgeModifierFaceSelections(ctx, entries, label, edgeTargets, builder);
      },
      edges: (entries: any[]) => {
        annotateEdgeModifierEdgeSelections(ctx, entries, label, edgeTargets, builder);
      },
    };
  }

export function makeSplitFaceSelectionLedgerPlan(ctx: any, 
    upstream: KernelResult,
    ownerShape: any,
    faceTargets: KernelSelection[]
  ): any {
    const mutationPlan = makeFaceMutationSelectionLedgerPlan(ctx, upstream, ownerShape, []);
    return {
      faces: (entries: any[]) => {
        mutationPlan.faces?.(entries);
        annotateSplitFaceSelections(ctx, entries, faceTargets);
      },
    };
  }

export function makeKnitSelectionLedgerPlan(ctx: any, sourceFaces: KernelSelection[]): any {
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
      faces: (entries: any[]) => {
        annotateKnitFaceSelections(ctx, entries, sourceFaces, mergedFrom);
      },
    };
  }

export function makeBooleanSelectionLedgerPlan(ctx: any, 
    op: "union" | "subtract" | "intersect",
    upstream: KernelResult,
    leftShape: any,
    rightShape: any,
    builder: any
  ): any {
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
      faces: (entries: any[]) => {
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
          ? (entries: any[]) => {
              annotateBooleanCutEdgeSelections(ctx, entries);
            }
          : op === "union" || op === "intersect"
            ? (entries: any[]) => {
                annotateBooleanSemanticEdgeSelections(ctx, entries);
              }
          : undefined,
    };
  }

function annotateBooleanUnionFaceSelections(ctx: any, 
    entries: any[],
    sourceFaces: KernelSelection[],
    builder: any
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
      const matched: any[] = [];
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

function assignBooleanUnionFaceMatches(ctx: any, 
    allEntries: any[],
    matches: any[],
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

function annotateBooleanPreservedFaceSelections(ctx: any, 
    entries: any[],
    sourceFaces: KernelSelection[],
    builder: any
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
      const exactMatches: any[] = [];
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
            entry: any;
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

function assignBooleanPreservedFaceMatches(ctx: any, 
    matches: any[],
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

function annotateBooleanCutFaceSelections(ctx: any, 
    entries: any[],
    toolFaces: KernelSelection[],
    builder: any
  ): void {
    const unmatched = entries.filter((entry) => !entry.ledger?.slot);
    for (let i = 0; i < toolFaces.length; i += 1) {
      const target = toolFaces[i];
      if (!target) continue;
      const sourceShape = target.meta["shape"];
      if (!sourceShape) continue;
      const slotRoot = selectionSlotForLineage(ctx, target)
        ? `cut.${selectionSlotForLineage(ctx, target)}`
        : `cut.seed.${i + 1}`;
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

function annotateBooleanCutEdgeSelections(ctx: any, entries: any[]): void {
    const unmatched = entries.filter((entry) => !entry.ledger?.slot);
    const matched = unmatched.filter((entry) => booleanCutDerivedEdgeSlot(ctx, entry) !== null);
    if (matched.length === 0) return;

    matched.sort((a, b) => {
      const aSlot = booleanCutDerivedEdgeSlot(ctx, a) ?? "";
      const bSlot = booleanCutDerivedEdgeSlot(ctx, b) ?? "";
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
      const slot = booleanCutDerivedEdgeSlot(ctx, entry);
      if (!slot) continue;
      slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
    }
    const slotIndexes = new Map<string, number>();
    for (const entry of matched) {
      let slot = booleanCutDerivedEdgeSlot(ctx, entry);
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

function annotateBooleanSemanticEdgeSelections(ctx: any, entries: any[]): void {
    const unmatched = entries.filter((entry) => !entry.ledger?.slot);
    const matched = unmatched
      .map((entry) => ({
        entry,
        descriptor: booleanSemanticEdgeDescriptor(ctx, entry),
      }))
      .filter(
        (
          candidate
        ): candidate is {
          entry: any;
          descriptor: any;
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

function booleanCutDerivedEdgeSlot(ctx: any, entry: any): string | null {
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

function booleanSemanticEdgeDescriptor(ctx: any, 
    entry: any
  ): ReturnType<typeof describeBooleanSemanticEdge> {
    return describeBooleanSemanticEdge(entry.meta["adjacentFaceSlots"]);
  }

function annotateFaceMutationSelections(ctx: any, 
    entries: any[],
    ownerFaces: KernelSelection[],
    replacements: Array<{ from: KernelSelection; to: any }>,
    replacementSources: Set<string>
  ): void {
    const unmatched = entries.filter((entry) => !entry.ledger?.slot);

    const applyHint = (entry: any, sourceSelection: KernelSelection): void => {
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
      targetShape: any,
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

function bestFaceMutationFallbackIndex(ctx: any, 
    entries: any[],
    sourceSelection: KernelSelection
  ): number {
    if (entries.length === 0) return -1;
    const sourceMeta = sourceSelection.meta;
    const sourceNormal =
      typeof sourceMeta["normal"] === "string" ? (sourceMeta["normal"] as string) : null;
    const sourceSurfaceType =
      typeof sourceMeta["surfaceType"] === "string"
        ? (sourceMeta["surfaceType"] as string)
        : null;
    const sourcePlanar =
      typeof sourceMeta["planar"] === "boolean" ? (sourceMeta["planar"] as boolean) : null;
    const sourceArea =
      typeof sourceMeta["area"] === "number" ? (sourceMeta["area"] as number) : null;
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

        const area =
          typeof entry.meta["area"] === "number" ? (entry.meta["area"] as number) : null;
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
        ): candidate is { index: number; areaDelta: number; centerDelta: number } =>
          candidate !== null
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

function annotateHoleFaceSelections(ctx: any, 
    entries: any[],
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
        !centers.some(
          (origin) => distancePointToAxis(ctx, center, origin, axisDir) <= holeTolerance
        )
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

function annotateDraftFaceSelections(ctx: any, 
    entries: any[],
    faceTargets: KernelSelection[],
    builder: any
  ): void {
    annotateModifiedFaceSelections(ctx, entries, faceTargets, builder);
  }

function annotateModifiedFaceSelections(ctx: any, 
    entries: any[],
    faceTargets: KernelSelection[],
    builder: any
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

function ownerFaceSelectionsForShape(ctx: any, upstream: KernelResult, ownerShape: any): KernelSelection[] {
    return upstream.selections.filter(
      (selection): selection is KernelSelection =>
        selection.kind === "face" &&
        !!selection.meta["owner"] &&
        ctx.shapesSame(selection.meta["owner"], ownerShape)
    );
  }

function annotateEdgeModifierFaceSelections(ctx: any, 
    entries: any[],
    label: "fillet" | "chamfer",
    edgeTargets: KernelSelection[],
    builder: any
  ): void {
    const unmatched = entries.filter((entry) => !entry.ledger?.slot);
    for (let i = 0; i < edgeTargets.length; i += 1) {
      const target = edgeTargets[i];
      if (!target) continue;
      const sourceShape = target.meta["shape"];
      if (!sourceShape) continue;
      const slotRoot = selectionSlotForLineage(ctx, target)
        ? `${label}.${selectionSlotForLineage(ctx, target)}`
        : `${label}.seed.${i + 1}`;
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
        const hint: any = {
          role: label,
          lineage: { kind: "modified", from: target.id },
          slot: generatedIndex === 1 ? slotRoot : `${slotRoot}.part.${generatedIndex}`,
        };
        ctx.applySelectionLedgerHint(entry, hint);
      }
    }
  }

function annotateEdgeModifierEdgeSelections(ctx: any, 
    entries: any[],
    label: "fillet" | "chamfer",
    edgeTargets: KernelSelection[],
    builder: any
  ): void {
    const unmatched = entries.filter((entry) => !entry.ledger?.slot);
    for (let i = 0; i < edgeTargets.length; i += 1) {
      const target = edgeTargets[i];
      if (!target) continue;
      const sourceShape = target.meta["shape"];
      if (!sourceShape) continue;
      const slotRoot = selectionSlotForLineage(ctx, target)
        ? `${label}.${selectionSlotForLineage(ctx, target)}`
        : `${label}.seed.${i + 1}`;
      const descendantEdges = ctx.uniqueShapeList(
        collectGeneratedShapes(ctx, builder, sourceShape).flatMap((shape) => {
          const faces = ctx.collectFacesFromShape(shape);
          if (faces.length > 0) {
            return faces.flatMap((face: any) => ctx.collectEdgesFromShape(face));
          }
          const edges = ctx.collectEdgesFromShape(shape);
          return edges.length > 0 ? edges : [shape];
        })
      );
      if (descendantEdges.length === 0) continue;

      const matched: any[] = [];
      for (const candidate of descendantEdges) {
        const index = unmatched.findIndex((entry) => ctx.shapesSame(entry.shape, candidate));
        if (index < 0) continue;
        const [entry] = unmatched.splice(index, 1);
        if (!entry) continue;
        matched.push(entry);
      }
      if (matched.length === 0) continue;

      matched.sort((a, b) => {
        const aSlot = edgeModifierDerivedEdgeSlot(ctx, a, label, slotRoot) ?? "";
        const bSlot = edgeModifierDerivedEdgeSlot(ctx, b, label, slotRoot) ?? "";
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
        const slot = edgeModifierDerivedEdgeSlot(ctx, entry, label, slotRoot);
        if (!slot) continue;
        slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1);
      }
      const slotIndexes = new Map<string, number>();
      for (let edgeIndex = 0; edgeIndex < matched.length; edgeIndex += 1) {
        const entry = matched[edgeIndex];
        if (!entry) continue;
        let slot =
          edgeModifierDerivedEdgeSlot(ctx, entry, label, slotRoot) ??
          `${slotRoot}.edge.${edgeIndex + 1}`;
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

function edgeModifierDerivedEdgeSlot(ctx: any, 
    entry: any,
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

function annotateSplitFaceSelections(ctx: any, 
    entries: any[],
    faceTargets: KernelSelection[]
  ): void {
    const remaining = entries.filter((entry) => !entry.ledger?.slot);
    for (let i = 0; i < faceTargets.length; i += 1) {
      const target = faceTargets[i];
      if (!target) continue;
      const slotRoot = selectionSlotForLineage(ctx, target)
        ? `split.${selectionSlotForLineage(ctx, target)}`
        : `split.seed.${i + 1}`;
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
            entry: any;
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

function annotateKnitFaceSelections(ctx: any, 
    entries: any[],
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
      const slot = sourceSlot
        ? `merge.part.${i + 1}.${sourceSlot}`
        : `merge.part.${i + 1}`;
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

function radiusMatches(ctx: any, actual: number, expected: number): boolean {
    const tolerance = Math.max(1e-4, Math.abs(expected) * 1e-4);
    return Math.abs(actual - expected) <= tolerance;
  }

function distancePointToAxis(ctx: any, 
    point: [number, number, number],
    origin: [number, number, number],
    axisDir: [number, number, number]
  ): number {
    const relative = ctx.subVec(point, origin);
    const projection = ctx.scaleVec(axisDir, dot(relative, axisDir));
    return vecLength(ctx.subVec(relative, projection));
  }

function selectionSlotForLineage(ctx: any, selection: KernelSelection): string | undefined {
    if (typeof selection.record?.slot === "string" && selection.record.slot.trim().length > 0) {
      return selection.record.slot.trim();
    }
    const metaSlot = selection.meta["selectionSlot"];
    if (typeof metaSlot === "string" && metaSlot.trim().length > 0) {
      return metaSlot.trim();
    }
    return undefined;
  }

function selectionRoleForLineage(ctx: any, selection: KernelSelection): string | undefined {
    if (typeof selection.record?.role === "string" && selection.record.role.trim().length > 0) {
      return selection.record.role.trim();
    }
    const metaRole = selection.meta["role"];
    if (typeof metaRole === "string" && metaRole.trim().length > 0) {
      return metaRole.trim();
    }
    return undefined;
  }

function splitBranchOrdering(ctx: any, 
    entry: any,
    sourceSelection: KernelSelection
  ): [number, number, number] | null {
    const sourceMeta = sourceSelection.meta;
    const sourceSurfaceType =
      typeof sourceMeta["surfaceType"] === "string"
        ? (sourceMeta["surfaceType"] as string)
        : null;
    const entrySurfaceType =
      typeof entry.meta["surfaceType"] === "string"
        ? (entry.meta["surfaceType"] as string)
        : null;
    if (sourceSurfaceType && entrySurfaceType && sourceSurfaceType !== entrySurfaceType) {
      return null;
    }

    const sourcePlanar =
      typeof sourceMeta["planar"] === "boolean" ? (sourceMeta["planar"] as boolean) : null;
    const entryPlanar =
      typeof entry.meta["planar"] === "boolean" ? (entry.meta["planar"] as boolean) : null;
    if (sourcePlanar !== null && entryPlanar !== null && sourcePlanar !== entryPlanar) {
      return null;
    }

    const sourceNormal = ctx.vectorFingerprint(
      sourceMeta["planeNormal"] ?? sourceMeta["normalVec"]
    );
    const entryNormal = ctx.vectorFingerprint(
      entry.meta["planeNormal"] ?? entry.meta["normalVec"]
    );
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
    const xSeed =
      ctx.vectorFingerprint(sourceMeta["planeXDir"]) ?? ctx.defaultAxisForNormal(normal);
    const xDir = normalizeVector(xSeed);
    const ySeed = ctx.vectorFingerprint(sourceMeta["planeYDir"]) ?? cross(normalizeVector(normal), xDir);
    const yDir = normalizeVector(ySeed);
    const relative = ctx.subVec(center, origin);
    const x = dot(relative, xDir);
    const y = dot(relative, yDir);
    const z = typeof entry.meta["centerZ"] === "number" ? (entry.meta["centerZ"] as number) : center[2];
    return [x, y, z];
  }

function annotatePrismFaceSelections(ctx: any, 
    entries: any[],
    axis: [number, number, number],
    opts?: {
      prism?: any;
      wire?: any;
      wireSegmentSlots?: string[];
    }
  ): void {
    if (entries.length === 0) return;
    const centers = entries
      .map((entry) => ctx.vectorFingerprint(entry.meta.center))
      .filter((center): center is [number, number, number] => Array.isArray(center));
    const centroid =
      centers.length > 0
        ? ([
            centers.reduce((sum, center) => sum + center[0], 0) / centers.length,
            centers.reduce((sum, center) => sum + center[1], 0) / centers.length,
            centers.reduce((sum, center) => sum + center[2], 0) / centers.length,
          ] as [number, number, number])
        : ([0, 0, 0] as [number, number, number]);

    const caps: Array<{ entry: any; projection: number }> = [];
    const sideEntries: any[] = [];
    for (const entry of entries) {
      const center = ctx.vectorFingerprint(entry.meta.center) ?? centroid;
      const projection = dot(ctx.subVec(center, centroid), axis);
      const normalVec = ctx.vectorFingerprint(entry.meta.normalVec);
      const alignment = normalVec ? Math.abs(dot(normalizeVector(normalVec), axis)) : 0;
      if (alignment > 0.98) {
        caps.push({ entry, projection });
        continue;
      }
      sideEntries.push(entry);
    }

    caps.sort((a, b) => a.projection - b.projection);

    const bottom = caps[0]?.entry;
    const top = caps[caps.length - 1]?.entry;
    if (bottom) {
      ctx.applySelectionLedgerHint(bottom, {
        slot: "bottom",
        role: "bottom",
        lineage: { kind: "created" },
      });
    }
    if (top && top !== bottom) {
      ctx.applySelectionLedgerHint(top, {
        slot: "top",
        role: "top",
        lineage: { kind: "created" },
      });
    }

    if (sideEntries.length === 0) return;
    const historyApplied =
      opts?.prism && opts?.wire && Array.isArray(opts.wireSegmentSlots)
        ? applyPrismHistorySideSlots(ctx, 
            sideEntries,
            opts.prism,
            opts.wire,
            opts.wireSegmentSlots
          )
        : false;
    if (historyApplied) return;

    const basis = ctx.basisFromNormal(axis, undefined, centroid);
    const ranked = sideEntries
      .map((entry) => {
        const center = ctx.vectorFingerprint(entry.meta.center) ?? centroid;
        const relative = ctx.subVec(center, centroid);
        const radial = ctx.subVec(relative, ctx.scaleVec(axis, dot(relative, axis)));
        const x = dot(radial, basis.xDir);
        const y = dot(radial, basis.yDir);
        const angle = Number.isFinite(x) && Number.isFinite(y) ? Math.atan2(y, x) : 0;
        const height = dot(relative, axis);
        const area = ctx.numberFingerprint(entry.meta.area) ?? 0;
        return { entry, angle, height, area };
      })
      .sort((a, b) => {
        const byAngle = a.angle - b.angle;
        if (byAngle !== 0) return byAngle;
        const byHeight = a.height - b.height;
        if (byHeight !== 0) return byHeight;
        return b.area - a.area;
      });

    for (let i = 0; i < ranked.length; i += 1) {
      const current = ranked[i];
      if (!current) continue;
      ctx.applySelectionLedgerHint(current.entry, {
        slot: `side.${i + 1}`,
        role: "side",
        lineage: { kind: "created" },
      });
    }
  }

function annotateRevolveFaceSelections(ctx: any, 
    entries: any[],
    _angleRad: number,
    opts: {
      revol: any;
      wire: any;
      wireSegmentSlots: string[];
    }
  ): void {
    if (entries.length === 0) return;
    applyGeneratedDerivedFaceSlots(ctx, 
      entries,
      opts.revol,
      opts.wire,
      opts.wireSegmentSlots,
      "profile"
    );
  }

function applyPrismHistorySideSlots(ctx: any, 
    sideEntries: any[],
    prism: any,
    wire: any,
    wireSegmentSlots: string[]
  ): boolean {
    return applyGeneratedDerivedFaceSlots(ctx, sideEntries, prism, wire, wireSegmentSlots, "side");
  }

function applyGeneratedDerivedFaceSlots(ctx: any, 
    entries: any[],
    builder: any,
    wire: any,
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

function collectWireEdgesInOrder(ctx: any, wire: any): any[] {
    const occt = ctx.occt as any;
    const edges: any[] = [];
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(ctx.toWire(wire), occt.TopAbs_ShapeEnum.TopAbs_EDGE, occt.TopAbs_ShapeEnum.TopAbs_SHAPE);
    for (; explorer.More(); explorer.Next()) {
      edges.push(explorer.Current());
    }
    return edges;
  }

function collectGeneratedShapes(ctx: any, builder: any, source: any): any[] {
    return collectHistoryShapes(ctx, builder, ["Generated", "Generated_1"], source);
  }

function collectModifiedShapes(ctx: any, builder: any, source: any): any[] {
    return collectHistoryShapes(ctx, builder, ["Modified", "Modified_1"], source);
  }

function collectHistoryShapes(ctx: any, 
    builder: any,
    methodNames: string[],
    source: any
  ): any[] {
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

function drainShapeList(ctx: any, list: any): any[] {
    const shapes: any[] = [];
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

function readShapeListSize(ctx: any, list: any): number {
    try {
      const size = ctx.callWithFallback(list, ["Size", "Size_1"], [[], []]);
      return typeof size === "number" && Number.isFinite(size) ? size : 0;
    } catch {
      return 0;
    }
  }

