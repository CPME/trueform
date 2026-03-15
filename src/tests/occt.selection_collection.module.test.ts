import assert from "node:assert/strict";
import type { KernelSelectionRecord } from "../backend.js";
import type { CollectedSubshape } from "../occt/operation_contexts.js";
import { collectSelections } from "../occt/selection_collection.js";
import {
  applySelectionLedgerHint,
  assignStableSelectionIds,
} from "../occt/selection_ids.js";
import {
  normalizeSelectionToken,
  numberFingerprint,
  stringArrayFingerprint,
  stringFingerprint,
  vectorFingerprint,
} from "../occt/selection_fingerprint.js";
import { runTests } from "./occt_test_utils.js";

type TestShape = { id: string };

type TestDepsOptions = {
  faceEntries: CollectedSubshape[];
  edgeEntries: CollectedSubshape[];
  edgePlan?: (entries: CollectedSubshape[]) => void;
};

function makeDeps(options: TestDepsOptions) {
  return {
    occt: {
      TopAbs_ShapeEnum: {
        TopAbs_FACE: "face",
        TopAbs_EDGE: "edge",
      },
    },
    shapeCenter: () => [0, 0, 0] as [number, number, number],
    applySelectionLedgerHint: (entry: CollectedSubshape, hint: unknown) =>
      applySelectionLedgerHint(entry, hint as Parameters<typeof applySelectionLedgerHint>[1]),
    collectUniqueSubshapes: (_shape: unknown, shapeKind: unknown) => {
      if (shapeKind === "face") return options.faceEntries;
      if (shapeKind === "edge") return options.edgeEntries;
      return [];
    },
    assignStableSelectionIds: (
      kind: "face" | "edge" | "solid" | "surface",
      entries: CollectedSubshape[]
    ): Array<{ id: string; aliases?: string[]; record: KernelSelectionRecord }> =>
      assignStableSelectionIds(kind, entries, {
        normalizeSelectionToken,
        stringFingerprint,
        stringArrayFingerprint,
        numberFingerprint,
        vectorFingerprint,
      }),
    faceMetadata: (
      face: unknown,
      owner: unknown,
      featureId: string,
      ownerKey: string
    ) => ({
      shape: face,
      owner,
      ownerKey,
      createdBy: featureId,
    }),
    edgeMetadata: (
      edge: unknown,
      owner: unknown,
      featureId: string,
      ownerKey: string
    ) => ({
      shape: edge,
      owner,
      ownerKey,
      createdBy: featureId,
      role: "edge",
    }),
    annotateEdgeAdjacencyMetadata: () => {},
    edgePlan: options.edgePlan,
  };
}

const tests = [
  {
    name: "selection collection module: semantic edge fallback derives slot and legacy alias from adjacent face slots",
    fn: async () => {
      const owner: TestShape = { id: "owner" };
      const faceA: CollectedSubshape = {
        shape: { id: "face-side" },
        meta: { shape: { id: "face-side" }, owner, ownerKey: "body:main", createdBy: "base" },
      };
      const faceB: CollectedSubshape = {
        shape: { id: "face-top" },
        meta: { shape: { id: "face-top" }, owner, ownerKey: "body:main", createdBy: "base" },
      };
      applySelectionLedgerHint(faceA, {
        slot: "side.1",
        role: "side",
        lineage: { kind: "created" },
      });
      applySelectionLedgerHint(faceB, {
        slot: "top",
        role: "top",
        lineage: { kind: "created" },
      });
      const edgeEntries: CollectedSubshape[] = [
        {
          shape: { id: "edge-1" },
          meta: {
            shape: { id: "edge-1" },
            owner,
            ownerKey: "body:main",
            createdBy: "base",
            role: "edge",
            adjacentFaceSlots: ["side.1", "top"],
            center: [0, 0, 0],
          },
        },
      ];
      const deps = makeDeps({ faceEntries: [faceA, faceB], edgeEntries });
      const selections = collectSelections({
        shape: owner,
        featureId: "base",
        ownerKey: "body:main",
        deps,
      });

      const edge = selections.find((selection) => selection.kind === "edge");
      assert.ok(edge, "missing edge selection");
      assert.equal(edge?.id, "edge:body.main~base.side.1.bound.top");
      assert.equal(edge?.meta["selectionSlot"], "side.1.bound.top");
      const aliases = Array.isArray(edge?.meta["selectionAliases"])
        ? (edge?.meta["selectionAliases"] as string[])
        : [];
      assert.equal(aliases.length, 1, "expected one legacy alias for semantic fallback edge");
      assert.ok(
        aliases[0]?.startsWith("edge:body.main~base.h"),
        `expected legacy hash alias, got ${aliases[0] ?? ""}`
      );
    },
  },
  {
    name: "selection collection module: semantic edge fallback does not override feature-specific edge slots",
    fn: async () => {
      const owner: TestShape = { id: "owner" };
      const faceA: CollectedSubshape = {
        shape: { id: "face-a" },
        meta: { shape: { id: "face-a" }, owner, ownerKey: "body:main", createdBy: "base" },
      };
      const faceB: CollectedSubshape = {
        shape: { id: "face-b" },
        meta: { shape: { id: "face-b" }, owner, ownerKey: "body:main", createdBy: "base" },
      };
      applySelectionLedgerHint(faceA, {
        slot: "side.1",
        role: "side",
        lineage: { kind: "created" },
      });
      applySelectionLedgerHint(faceB, {
        slot: "top",
        role: "top",
        lineage: { kind: "created" },
      });
      const edgeEntries: CollectedSubshape[] = [
        {
          shape: { id: "edge-1" },
          meta: {
            shape: { id: "edge-1" },
            owner,
            ownerKey: "body:main",
            createdBy: "base",
            role: "edge",
            adjacentFaceSlots: ["side.1", "top"],
            center: [0, 0, 0],
          },
        },
      ];
      const deps = makeDeps({
        faceEntries: [faceA, faceB],
        edgeEntries,
        edgePlan: (entries) => {
          const [entry] = entries;
          if (!entry) return;
          applySelectionLedgerHint(entry, {
            slot: "custom.edge.1",
            role: "edge",
            lineage: { kind: "created" },
          });
        },
      });
      const selections = collectSelections({
        shape: owner,
        featureId: "base",
        ownerKey: "body:main",
        opts: {
          ledgerPlan: {
            edges: deps.edgePlan,
          },
        },
        deps,
      });

      const edge = selections.find((selection) => selection.kind === "edge");
      assert.ok(edge, "missing edge selection");
      assert.equal(edge?.meta["selectionSlot"], "custom.edge.1");
      assert.equal(edge?.id, "edge:body.main~base.custom.edge.1");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
