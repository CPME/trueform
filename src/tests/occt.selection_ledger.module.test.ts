import assert from "node:assert/strict";
import type { KernelResult, KernelSelection } from "../backend.js";
import {
  makeHoleSelectionLedgerPlan,
  makeKnitSelectionLedgerPlan,
} from "../occt/selection_ledger_ops.js";
import type {
  CollectedSubshape,
  SelectionLedgerContext,
} from "../occt/operation_contexts.js";
import { runTests } from "./occt_test_utils.js";

function makeSelectionLedgerContext(): SelectionLedgerContext {
  return {
    occt: {},
    applySelectionLedgerHint: (entry, hint) => {
      entry.ledger = { ...(entry.ledger ?? {}), ...hint };
    },
    basisFromNormal: (normal, xHint, origin) => ({
      origin,
      normal,
      xDir: xHint ?? [1, 0, 0],
      yDir: [0, 1, 0],
    }),
    callWithFallback: () => null,
    collectEdgesFromShape: () => [],
    collectFacesFromShape: () => [],
    defaultAxisForNormal: (normal) => (Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]),
    numberFingerprint: (value) => (typeof value === "number" ? value : undefined),
    scaleVec: (v, s) => [v[0] * s, v[1] * s, v[2] * s],
    selectionTieBreakerFingerprint: (_kind, meta) => meta,
    shapeHash: (shape) => Number((shape as { hash?: number }).hash ?? 0),
    shapesSame: (left, right) => left === right,
    subVec: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    toWire: (shape) => shape,
    uniqueKernelSelectionIds: (selections) => selections.map((selection) => selection.id),
    uniqueShapeList: (shapes) => [...new Set(shapes)],
    vectorFingerprint: (value) =>
      Array.isArray(value) && value.length === 3
        ? [Number(value[0]), Number(value[1]), Number(value[2])]
        : undefined,
  };
}

const tests = [
  {
    name: "selection ledger module: hole plan tags wall and counterbore faces",
    fn: async () => {
      const ctx = makeSelectionLedgerContext();
      const ownerShape = { hash: 1 };
      const target: KernelSelection = {
        id: "face:top",
        kind: "face",
        meta: { shape: { hash: 10 }, selectionSlot: "top" },
        record: {
          ownerKey: "body:main",
          createdBy: "base",
          slot: "top",
          role: "top",
          lineage: { kind: "created" },
        },
      };
      const upstream: KernelResult = { outputs: new Map(), selections: [target] };
      const entries: CollectedSubshape[] = [
        {
          shape: { hash: 2 },
          meta: { center: [0.05, 0, 5], surfaceType: "cylinder", radius: 2 },
        },
        {
          shape: { hash: 3 },
          meta: { center: [0.02, 0, 2], surfaceType: "cylinder", radius: 3 },
        },
      ];

      const plan = makeHoleSelectionLedgerPlan(
        ctx,
        upstream,
        ownerShape,
        target,
        [[0, 0, 0]],
        [0, 0, 1],
        { radius: 2, counterboreRadius: 3, countersink: false }
      );
      plan.faces?.(entries);

      assert.equal(entries[0]?.ledger?.slot, "hole.top.wall");
      assert.equal(entries[1]?.ledger?.slot, "hole.top.counterbore");
      assert.equal(entries[0]?.ledger?.lineage?.kind, "modified");
    },
  },
  {
    name: "selection ledger module: knit plan preserves source slots and generated fallbacks",
    fn: async () => {
      const ctx = makeSelectionLedgerContext();
      const leftShape = { hash: 11 };
      const rightShape = { hash: 12 };
      const sourceFaces: KernelSelection[] = [
        {
          id: "face:left",
          kind: "face",
          meta: { shape: leftShape, selectionSlot: "left" },
          record: {
            ownerKey: "surface:seed",
            createdBy: "seed",
            slot: "left",
            role: "side",
            lineage: { kind: "created" },
          },
        },
        {
          id: "face:right",
          kind: "face",
          meta: { shape: rightShape, selectionSlot: "right" },
          record: {
            ownerKey: "surface:seed",
            createdBy: "seed",
            slot: "right",
            role: "side",
            lineage: { kind: "created" },
          },
        },
      ];
      const entries: CollectedSubshape[] = [
        { shape: leftShape, meta: { center: [0, 0, 0] } },
        { shape: rightShape, meta: { center: [1, 0, 0] } },
        { shape: { hash: 13 }, meta: { center: [2, 0, 0] } },
      ];

      const plan = makeKnitSelectionLedgerPlan(ctx, sourceFaces);
      plan.faces?.(entries);

      assert.equal(plan.solid?.lineage?.kind, "merged");
      assert.equal(entries[0]?.ledger?.slot, "merge.part.1.left");
      assert.equal(entries[1]?.ledger?.slot, "merge.part.2.right");
      assert.equal(entries[2]?.ledger?.slot, "merge.generated.1");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
