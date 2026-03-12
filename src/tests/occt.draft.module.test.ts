import assert from "node:assert/strict";
import type { KernelResult, KernelSelection } from "../backend.js";
import { BackendError } from "../errors.js";
import * as selectors from "../dsl/selectors.js";
import type { DraftContext } from "../occt/operation_contexts.js";
import { execDraft } from "../occt/draft_ops.js";
import { runTests } from "./occt_test_utils.js";

function makeDraftContext(state: {
  buildCount: number;
  addCalls: unknown[][];
  selections: number;
}): DraftContext {
  return {
    callWithFallback: (_target, _methods, argSets) => {
      state.addCalls.push(argSets[0] ?? []);
      return undefined;
    },
    collectSelections: () => {
      state.selections += 1;
      return [{ id: "body:main:solid", kind: "solid", meta: {} }];
    },
    makeDir: (x, y, z) => ({ x, y, z }),
    makeDraftBuilder: (owner) => ({ tag: "draft-builder", owner }),
    makeDraftSelectionLedgerPlan: () => ({ solid: { slot: "draft:solid" } }),
    makePln: (origin, normal) => ({ origin, normal }),
    readShape: (shape) => ({ tag: "drafted", shape }),
    resolveAxisSpec: () => [0, 0, 1],
    resolveOwnerKey: () => "body:base",
    resolveOwnerShape: (selection) => selection.meta["shape"] as object,
    resolvePlaneBasis: () => ({
      origin: [0, 0, 0],
      normal: [0, 0, 1],
      xDir: [1, 0, 0],
      yDir: [0, 1, 0],
    }),
    toFace: (shape) => shape,
    toResolutionContext: (upstream) => ({
      selections: upstream.selections,
      named: new Map(upstream.selections.map((selection) => [selection.id, selection])),
    }),
    tryBuild: () => {
      state.buildCount += 1;
    },
  };
}

const tests = [
  {
    name: "draft module: applies selected faces and publishes solid output",
    fn: async () => {
      const state = { buildCount: 0, addCalls: [] as unknown[][], selections: 0 };
      const ctx = makeDraftContext(state);
      const source: KernelSelection = {
        id: "body:base",
        kind: "solid",
        meta: { shape: { tag: "owner-shape" }, ownerKey: "body:base" },
      };
      const face: KernelSelection = {
        id: "face:side",
        kind: "face",
        meta: {
          shape: { tag: "face-shape" },
          ownerKey: "body:base",
          createdBy: "base",
          planar: true,
          normal: "+X",
        },
      };
      const upstream: KernelResult = { outputs: new Map(), selections: [source, face] };

      const result = execDraft(
        ctx,
        {
          kind: "feature.draft",
          id: "draft-1",
          source: selectors.selectorNamed("body:base"),
          faces: selectors.selectorFace([selectors.predCreatedBy("base")]),
          neutralPlane: { kind: "plane.datum", ref: "draft-neutral" },
          pullDirection: "+Z",
          angle: Math.PI / 60,
          result: "body:main",
        },
        upstream,
        () => source
      );

      assert.equal(state.buildCount, 1);
      assert.equal(state.addCalls.length, 1);
      assert.equal(state.selections, 1);
      assert.equal(result.outputs.get("body:main")?.kind, "solid");
    },
  },
  {
    name: "draft module: emits stable BackendError details for invalid angles",
    fn: async () => {
      const ctx = makeDraftContext({ buildCount: 0, addCalls: [], selections: 0 });
      const source: KernelSelection = {
        id: "body:base",
        kind: "solid",
        meta: { shape: { tag: "owner-shape" }, ownerKey: "body:base" },
      };
      const face: KernelSelection = {
        id: "face:side",
        kind: "face",
        meta: { shape: { tag: "face-shape" }, ownerKey: "body:base", createdBy: "base" },
      };
      const upstream: KernelResult = { outputs: new Map(), selections: [source, face] };

      assert.throws(
        () =>
          execDraft(
            ctx,
            {
              kind: "feature.draft",
              id: "draft-1",
              source: selectors.selectorNamed("body:base"),
              faces: selectors.selectorFace([selectors.predCreatedBy("base")]),
              neutralPlane: { kind: "plane.datum", ref: "draft-neutral" },
              pullDirection: "+Z",
              angle: 0,
              result: "body:main",
            },
            upstream,
            () => source
          ),
        (err) =>
          err instanceof BackendError &&
          err.code === "occt_draft_invalid_angle" &&
          err.details?.featureKind === "feature.draft" &&
          err.details?.featureId === "draft-1"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
