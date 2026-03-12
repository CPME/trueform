import assert from "node:assert/strict";
import type { KernelResult, KernelSelection } from "../backend.js";
import * as selectors from "../dsl/selectors.js";
import type { ShellContext } from "../occt/operation_contexts.js";
import { execShell } from "../occt/shell_ops.js";
import { runTests } from "./occt_test_utils.js";

function makeShellContext(
  source: KernelSelection,
  openFace: KernelSelection,
  state: {
    thickSolidCalls: Array<{ shape: unknown; removeFaces: unknown[]; offset: number; opts?: unknown }>;
    invalidShapeTags: Set<string>;
  }
): ShellContext {
  return {
    collectSelections: (_shape, _featureId, ownerKey, _tags, opts) => [
      {
        id: `${ownerKey}:solid`,
        kind: "solid",
        meta: { ownerKey, ledgerPlan: opts?.ledgerPlan },
      },
    ],
    isValidShape: (shape) =>
      !state.invalidShapeTags.has(String((shape as { tag?: string }).tag ?? "unknown")),
    makeFaceMutationSelectionLedgerPlan: (_upstream, ownerShape) => ({
      solid: { slot: `shape:${String((ownerShape as { tag?: string }).tag ?? "unknown")}` },
    }),
    makeSolidFromShells: (shape) => ({ tag: `stitched:${String((shape as { tag?: string }).tag ?? "shape")}` }),
    makeThickSolid: (shape, removeFaces, offset, _tolerance, opts) => {
      state.thickSolidCalls.push({ shape, removeFaces, offset, opts });
      if (opts) {
        return { tag: "retry-shape" };
      }
      return { tag: "initial-shape" };
    },
    normalizeSolid: (shape) => shape,
    resolve: (selector) => {
      const id = (selector as { name?: string }).name;
      if (id === "body:seed") return source;
      if (id === "face:open") return openFace;
      throw new Error(`unexpected selector ${String(id)}`);
    },
    shapeHasSolid: () => false,
  };
}

const tests = [
  {
    name: "shell module: retries invalid thick solid and publishes stitched result",
    fn: async () => {
      const sourceShape = { tag: "source-shape" };
      const openFaceShape = { tag: "open-face" };
      const source: KernelSelection = {
        id: "body:seed",
        kind: "solid",
        meta: { shape: sourceShape },
      };
      const openFace: KernelSelection = {
        id: "face:open",
        kind: "face",
        meta: { shape: openFaceShape },
      };
      const state = {
        thickSolidCalls: [] as Array<{
          shape: unknown;
          removeFaces: unknown[];
          offset: number;
          opts?: unknown;
        }>,
        invalidShapeTags: new Set<string>(["stitched:initial-shape"]),
      };
      const ctx = makeShellContext(source, openFace, state);
      const upstream: KernelResult = { outputs: new Map(), selections: [source, openFace] };

      const result = execShell(
        ctx,
        {
          kind: "feature.shell",
          id: "shell-1",
          source: selectors.selectorNamed("body:seed"),
          thickness: 2,
          direction: "outside",
          openFaces: [selectors.selectorNamed("face:open")],
          result: "body:shell",
        },
        upstream
      );

      assert.equal(state.thickSolidCalls.length, 2);
      assert.deepEqual(state.thickSolidCalls[0], {
        shape: sourceShape,
        removeFaces: [openFaceShape],
        offset: 2,
        opts: undefined,
      });
      assert.deepEqual(state.thickSolidCalls[1], {
        shape: sourceShape,
        removeFaces: [openFaceShape],
        offset: 2,
        opts: {
          intersection: true,
          selfIntersection: true,
          removeInternalEdges: true,
        },
      });
      const output = result.outputs.get("body:shell");
      assert.ok(output, "missing shell output");
      assert.deepEqual(output?.meta["shape"], { tag: "stitched:retry-shape" });
      assert.equal(result.selections[0]?.id, "body:shell:solid");
      assert.deepEqual(result.selections[0]?.meta["ledgerPlan"], {
        solid: { slot: "shape:source-shape" },
      });
    },
  },
  {
    name: "shell module: rejects non-face open face selectors",
    fn: async () => {
      const source: KernelSelection = {
        id: "body:seed",
        kind: "solid",
        meta: { shape: { tag: "source-shape" } },
      };
      const badOpenTarget: KernelSelection = {
        id: "edge:open",
        kind: "edge",
        meta: { shape: { tag: "edge-shape" } },
      };
      const ctx = makeShellContext(source, badOpenTarget, {
        thickSolidCalls: [],
        invalidShapeTags: new Set(),
      });
      const upstream: KernelResult = { outputs: new Map(), selections: [source, badOpenTarget] };

      assert.throws(
        () =>
          execShell(
            ctx,
            {
              kind: "feature.shell",
              id: "shell-1",
              source: selectors.selectorNamed("body:seed"),
              thickness: 2,
              openFaces: [selectors.selectorNamed("face:open")],
              result: "body:shell",
            },
            upstream
          ),
        /open face must resolve to a face/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
