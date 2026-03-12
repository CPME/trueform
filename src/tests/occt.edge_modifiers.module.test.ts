import assert from "node:assert/strict";
import type { KernelResult, KernelSelection } from "../backend.js";
import { executeEdgeModifier } from "../occt/edge_modifiers.js";
import * as selectors from "../dsl/selectors.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "edge modifiers module: uses derived output key and selection options",
    fn: async () => {
      const edgeSelection: KernelSelection = {
        id: "edge:1",
        kind: "edge",
        meta: { shape: { tag: "edge" }, ownerKey: "body:main" },
      };
      const upstream: KernelResult = { outputs: new Map(), selections: [edgeSelection] };
      let optionOwner: unknown = null;
      let optionTargets: KernelSelection[] = [];
      let collectOpts: unknown = null;

      const result = executeEdgeModifier(
        "fillet",
        {
          id: "fillet-1",
          edges: selectors.selectorNamed("edge:1"),
          result: "body:filleted",
        },
        upstream,
        {
          toResolutionContext: () => ({ selections: [edgeSelection], named: new Map([["edge:1", edgeSelection]]) }),
          resolveOwnerKey: () => "body:main",
          resolveOwnerShape: () => ({ tag: "owner" }),
          toEdge: (edge) => edge,
          tryBuild: () => undefined,
          readShape: () => ({ tag: "solid" }),
          collectSelections: (_shape, _featureId, ownerKey, _tags, opts) => {
            collectOpts = opts;
            return [
              {
                id: `${ownerKey}:solid`,
                kind: "solid",
                meta: { ownerKey },
              },
            ];
          },
          makeSelectionCollectionOptions: (_label, _upstream, owner, targets) => {
            optionOwner = owner;
            optionTargets = targets;
            return { rootKind: "solid" };
          },
        },
        (owner) => ({ owner }),
        () => true
      );

      assert.ok(result.outputs.get("body:filleted"), "missing fillet result");
      assert.deepEqual(optionTargets.map((target) => target.id), ["edge:1"]);
      assert.deepEqual(optionOwner, { tag: "owner" });
      assert.deepEqual(collectOpts, { rootKind: "solid" });
    },
  },
  {
    name: "edge modifiers module: rejects non-edge selectors",
    fn: async () => {
      const faceSelection: KernelSelection = {
        id: "face:1",
        kind: "face",
        meta: { shape: { tag: "face" }, ownerKey: "body:main" },
      };
      const upstream: KernelResult = { outputs: new Map(), selections: [faceSelection] };

      assert.throws(
        () =>
          executeEdgeModifier(
            "chamfer",
            {
              id: "chamfer-1",
              edges: selectors.selectorNamed("face:1"),
            },
            upstream,
            {
              toResolutionContext: () => ({ selections: [faceSelection], named: new Map([["face:1", faceSelection]]) }),
              resolveOwnerKey: () => "body:main",
              resolveOwnerShape: () => ({ tag: "owner" }),
              toEdge: (edge) => edge,
              tryBuild: () => undefined,
              readShape: () => ({ tag: "solid" }),
              collectSelections: () => [],
            },
            () => ({ owner: true }),
            () => true
          ),
        /must resolve to an edge/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
