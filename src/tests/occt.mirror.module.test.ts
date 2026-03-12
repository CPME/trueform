import assert from "node:assert/strict";
import type { KernelResult, KernelSelection } from "../backend.js";
import { BackendError } from "../errors.js";
import * as selectors from "../dsl/selectors.js";
import type { MirrorContext } from "../occt/operation_contexts.js";
import { execMirror } from "../occt/mirror_ops.js";
import { runTests } from "./occt_test_utils.js";

function makeMirrorContext(state: { builds: number }): MirrorContext {
  return {
    collectSelections: (_shape, _featureId, ownerKey, _tags, opts) => [
      {
        id: `${ownerKey}:${opts?.rootKind ?? "solid"}`,
        kind: "solid",
        meta: {},
      },
    ],
    callWithFallback: () => undefined,
    makeAx2WithXDir: (origin, normal, xDir) => ({ origin, normal, xDir }),
    makeDir: (x, y, z) => ({ x, y, z }),
    makePnt: (x, y, z) => ({ x, y, z }),
    newOcct: (name, ...args) => ({ name, args }),
    readShape: (shape) => ({ tag: "mirrored", shape }),
    resolvePlaneBasis: () => ({
      origin: [0, 0, 0],
      normal: [1, 0, 0],
      xDir: [0, 1, 0],
      yDir: [0, 0, 1],
    }),
    tryBuild: () => {
      state.builds += 1;
    },
  };
}

const tests = [
  {
    name: "mirror module: mirrors solid output and publishes solid-root selections",
    fn: async () => {
      const state = { builds: 0 };
      const ctx = makeMirrorContext(state);
      const source: KernelSelection = {
        id: "body:base",
        kind: "solid",
        meta: { shape: { tag: "source-shape" } },
      };
      const upstream: KernelResult = { outputs: new Map(), selections: [source] };

      const result = execMirror(
        ctx,
        {
          kind: "feature.mirror",
          id: "mirror-1",
          source: selectors.selectorNamed("body:base"),
          plane: { kind: "plane.datum", ref: "mirror-plane" },
          result: "body:mirror",
        },
        upstream,
        () => source
      );

      assert.equal(state.builds, 1);
      assert.equal(result.outputs.get("body:mirror")?.kind, "solid");
      assert.deepEqual(result.outputs.get("body:mirror")?.meta["shape"], {
        tag: "mirrored",
        shape: {
          name: "BRepBuilderAPI_Transform",
          args: [
            { tag: "source-shape" },
            {
              name: "gp_Trsf",
              args: [],
            },
            true,
          ],
        },
      });
    },
  },
  {
    name: "mirror module: emits stable BackendError details for invalid source kinds",
    fn: async () => {
      const ctx = makeMirrorContext({ builds: 0 });
      const source: KernelSelection = {
        id: "edge:seed",
        kind: "edge",
        meta: { shape: { tag: "edge-shape" } },
      };
      const upstream: KernelResult = { outputs: new Map(), selections: [source] };

      assert.throws(
        () =>
          execMirror(
            ctx,
            {
              kind: "feature.mirror",
              id: "mirror-1",
              source: selectors.selectorNamed("edge:seed"),
              plane: { kind: "plane.datum", ref: "mirror-plane" },
              result: "body:mirror",
            },
            upstream,
            () => source
          ),
        (err) =>
          err instanceof BackendError &&
          err.code === "occt_mirror_invalid_source" &&
          err.details?.featureKind === "feature.mirror" &&
          err.details?.featureId === "mirror-1"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
