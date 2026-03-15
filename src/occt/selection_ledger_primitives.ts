import { dot, isFiniteVec, normalizeVector } from "./vector_math.js";
import type { SelectionLedgerContext, SelectionLedgerPlan } from "./operation_contexts.js";
import { applyGeneratedDerivedFaceSlots } from "./selection_ledger_common.js";
import { describeSemanticEdgeFromAdjacentFaces } from "../selection_semantics.js";
import { hashValue } from "../hash.js";

export function makePrismSelectionLedgerPlan(
  ctx: SelectionLedgerContext,
  axis: [number, number, number],
  opts?: {
    prism?: unknown;
    wire?: unknown;
    wireSegmentSlots?: string[];
  }
): SelectionLedgerPlan {
  const normalizedAxis = normalizeVector(axis);
  if (!isFiniteVec(normalizedAxis)) {
    return {};
  }
  return {
    faces: (entries) =>
      annotatePrismFaceSelections(ctx, entries, normalizedAxis, {
        prism: opts?.prism,
        wire: opts?.wire,
        wireSegmentSlots: opts?.wireSegmentSlots,
      }),
    edges: (entries) => annotatePrismEdgeSelections(ctx, entries),
  };
}

export function makeRevolveSelectionLedgerPlan(
  ctx: SelectionLedgerContext,
  angleRad: number,
  opts: {
    revol: unknown;
    wire: unknown;
    wireSegmentSlots: string[];
  }
): SelectionLedgerPlan {
  return {
    faces: (entries) =>
      annotateRevolveFaceSelections(ctx, entries, angleRad, {
        revol: opts.revol,
        wire: opts.wire,
        wireSegmentSlots: opts.wireSegmentSlots,
      }),
  };
}

function annotatePrismFaceSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown> }>,
  axis: [number, number, number],
  opts?: {
    prism?: unknown;
    wire?: unknown;
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

  const caps: Array<{ entry: { shape: unknown; meta: Record<string, unknown> }; projection: number }> = [];
  const sideEntries: Array<{ shape: unknown; meta: Record<string, unknown> }> = [];
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
      ? applyPrismHistorySideSlots(ctx, sideEntries, opts.prism, opts.wire, opts.wireSegmentSlots)
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

function annotateRevolveFaceSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{ shape: unknown; meta: Record<string, unknown> }>,
  _angleRad: number,
  opts: {
    revol: unknown;
    wire: unknown;
    wireSegmentSlots: string[];
  }
): void {
  if (entries.length === 0) return;
  applyGeneratedDerivedFaceSlots(ctx, entries, opts.revol, opts.wire, opts.wireSegmentSlots, "profile");
}

function applyPrismHistorySideSlots(
  ctx: SelectionLedgerContext,
  sideEntries: Array<{ shape: unknown; meta: Record<string, unknown> }>,
  prism: unknown,
  wire: unknown,
  wireSegmentSlots: string[]
): boolean {
  return applyGeneratedDerivedFaceSlots(ctx, sideEntries, prism, wire, wireSegmentSlots, "side");
}

function annotatePrismEdgeSelections(
  ctx: SelectionLedgerContext,
  entries: Array<{
    shape: unknown;
    meta: Record<string, unknown>;
    ledger?: { slot?: string };
  }>
): void {
  const matched = entries
    .filter((entry) => !entry.ledger?.slot)
    .map((entry) => ({
      entry,
      descriptor: describeSemanticEdgeFromAdjacentFaces(entry.meta["adjacentFaceSlots"]),
    }))
    .filter(
      (
        candidate
      ): candidate is {
        entry: {
          shape: unknown;
          meta: Record<string, unknown>;
          ledger?: { slot?: string };
        };
        descriptor: NonNullable<ReturnType<typeof describeSemanticEdgeFromAdjacentFaces>>;
      } => candidate.descriptor !== null
    );
  if (matched.length === 0) return;

  matched.sort((a, b) => {
    const bySlot = a.descriptor.slot.localeCompare(b.descriptor.slot);
    if (bySlot !== 0) return bySlot;
    const aTie = hashValue(ctx.selectionTieBreakerFingerprint("edge", a.entry.meta));
    const bTie = hashValue(ctx.selectionTieBreakerFingerprint("edge", b.entry.meta));
    const byTie = aTie.localeCompare(bTie);
    if (byTie !== 0) return byTie;
    return ctx.shapeHash(a.entry.shape) - ctx.shapeHash(b.entry.shape);
  });

  for (const candidate of matched) {
    ctx.applySelectionLedgerHint(candidate.entry, {
      slot: candidate.descriptor.slot,
      role: "edge",
      lineage: { kind: "created" },
    });
  }
}
