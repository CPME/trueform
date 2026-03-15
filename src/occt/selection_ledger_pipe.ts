import type { SelectionLedgerContext, SelectionLedgerPlan } from "./operation_contexts.js";
import { dot, normalizeVector } from "./vector_math.js";

type FaceEntry = {
  shape: unknown;
  meta: Record<string, unknown>;
  ledger?: { slot?: string };
};

export function makePipeSelectionLedgerPlan(
  ctx: SelectionLedgerContext,
  opts: {
    axis: [number, number, number];
    origin: [number, number, number];
    innerRadius: number;
    length: number;
  }
): SelectionLedgerPlan {
  const axis = normalizeVector(opts.axis);
  const startCenter = opts.origin;
  const endCenter: [number, number, number] = [
    opts.origin[0] + axis[0] * opts.length,
    opts.origin[1] + axis[1] * opts.length,
    opts.origin[2] + axis[2] * opts.length,
  ];
  return {
    faces: (entries) =>
      annotatePipeLikeFaces(ctx, entries, {
        axis,
        startCenter,
        endCenter,
        hasInnerWall: opts.innerRadius > 0,
      }),
  };
}

export function makePipeSweepSelectionLedgerPlan(
  ctx: SelectionLedgerContext,
  opts: {
    startCenter: [number, number, number];
    endCenter: [number, number, number];
    hasInnerWall: boolean;
  }
): SelectionLedgerPlan {
  return {
    faces: (entries) =>
      annotatePipeLikeFaces(ctx, entries, {
        axis: null,
        startCenter: opts.startCenter,
        endCenter: opts.endCenter,
        hasInnerWall: opts.hasInnerWall,
      }),
  };
}

function annotatePipeLikeFaces(
  ctx: SelectionLedgerContext,
  entries: FaceEntry[],
  opts: {
    axis: [number, number, number] | null;
    startCenter: [number, number, number];
    endCenter: [number, number, number];
    hasInnerWall: boolean;
  }
): void {
  const unmatched = entries.filter((entry) => !entry.ledger?.slot);
  if (unmatched.length === 0) return;

  annotatePipeCaps(ctx, unmatched.filter((entry) => entry.meta["surfaceType"] === "plane"), opts);
  annotatePipeWalls(
    ctx,
    unmatched.filter((entry) => entry.meta["surfaceType"] !== "plane"),
    opts.hasInnerWall
  );
}

function annotatePipeCaps(
  ctx: SelectionLedgerContext,
  entries: FaceEntry[],
  opts: {
    axis: [number, number, number] | null;
    startCenter: [number, number, number];
    endCenter: [number, number, number];
  }
): void {
  if (entries.length === 0) return;
  const startEndDistance = distance(opts.startCenter, opts.endCenter);
  const scored = entries
    .map((entry) => {
      const center = ctx.vectorFingerprint(entry.meta["center"]);
      if (!center) return null;
      if (opts.axis) {
        const relative: [number, number, number] = [
          center[0] - opts.startCenter[0],
          center[1] - opts.startCenter[1],
          center[2] - opts.startCenter[2],
        ];
        const projection = dot(relative, opts.axis);
        return {
          entry,
          startScore: Math.abs(projection),
          endScore: Math.abs(projection - startEndDistance),
        };
      }
      return {
        entry,
        startScore: distance(center, opts.startCenter),
        endScore: distance(center, opts.endCenter),
      };
    })
    .filter(
      (
        candidate
      ): candidate is {
        entry: FaceEntry;
        startScore: number;
        endScore: number;
      } => candidate !== null
    );
  if (scored.length === 0) return;

  scored.sort((a, b) => a.startScore - b.startScore);
  const start = scored[0]?.entry;
  if (start) {
    ctx.applySelectionLedgerHint(start, {
      slot: "start",
      role: "start",
      lineage: { kind: "created" },
    });
  }

  const end = scored
    .filter((candidate) => candidate.entry !== start)
    .sort((a, b) => a.endScore - b.endScore)[0]?.entry;
  if (end) {
    ctx.applySelectionLedgerHint(end, {
      slot: "end",
      role: "end",
      lineage: { kind: "created" },
    });
  }
}

function annotatePipeWalls(
  ctx: SelectionLedgerContext,
  entries: FaceEntry[],
  hasInnerWall: boolean
): void {
  if (entries.length === 0) return;
  const ordered = entries
    .map((entry) => ({
      entry,
      area: ctx.numberFingerprint(entry.meta["area"]) ?? 0,
      radius: ctx.numberFingerprint(entry.meta["radius"]),
    }))
    .sort((a, b) => {
      const aRadius = a.radius ?? Number.NEGATIVE_INFINITY;
      const bRadius = b.radius ?? Number.NEGATIVE_INFINITY;
      const byRadius = bRadius - aRadius;
      if (Math.abs(byRadius) > 1e-9) return byRadius;
      return b.area - a.area;
    });
  const outer = ordered[0]?.entry;
  if (outer) {
    ctx.applySelectionLedgerHint(outer, {
      slot: "outer",
      role: "outer",
      lineage: { kind: "created" },
    });
  }
  if (!hasInnerWall) return;
  const inner = ordered.find((candidate) => candidate.entry !== outer)?.entry;
  if (inner) {
    ctx.applySelectionLedgerHint(inner, {
      slot: "inner",
      role: "inner",
      lineage: { kind: "created" },
    });
  }
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
