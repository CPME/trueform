import assert from "node:assert/strict";
import * as selectors from "../dsl/selectors.js";
import type { BooleanContext } from "../occt/operation_contexts.js";
import { execBoolean } from "../occt/boolean_ops.js";
import type { KernelResult, KernelSelection } from "../backend.js";
import { runTests } from "./occt_test_utils.js";

function makeBooleanContext(
  leftSelection: KernelSelection,
  rightSelection: KernelSelection,
  state: {
    splitCalls: Array<{ shape: unknown; tools: unknown[] }>;
    selections: Array<{ ownerKey: string; hasLedgerPlan: boolean }>;
  }
): BooleanContext {
  return {
    collectSelections: (_shape, _featureId, ownerKey, _tags, opts) => {
      state.selections.push({ ownerKey, hasLedgerPlan: opts?.ledgerPlan !== undefined });
      return [{ id: `${ownerKey}:solid`, kind: "solid", meta: {} }];
    },
    makeBoolean: (op, left, right) => ({ tag: "builder", op, left, right }),
    makeBooleanSelectionLedgerPlan: (op) => ({ solid: { slot: `boolean:${op}` } }),
    normalizeSolid: (shape) => ({ tag: "normalized", shape }),
    readShape: (shape) => ({ tag: "shape", shape }),
    resolve: (selector) => {
      const id = (selector as { name?: string }).name;
      if (id === "body:left") return leftSelection;
      if (id === "body:right") return rightSelection;
      throw new Error(`unexpected selector ${String(id)}`);
    },
    resolveOwnerShape: (selection) => selection.meta["shape"] as object,
    splitByTools: (shape, tools) => {
      state.splitCalls.push({ shape, tools });
      return { tag: "split", shape, tools };
    },
  };
}

const tests = [
  {
    name: "boolean module: subtract splits by input tools and attaches ledger plan",
    fn: async () => {
      const leftShape = { tag: "left-shape" };
      const rightShape = { tag: "right-shape" };
      const leftSelection: KernelSelection = {
        id: "body:left",
        kind: "solid",
        meta: { shape: leftShape },
      };
      const rightSelection: KernelSelection = {
        id: "body:right",
        kind: "solid",
        meta: { shape: rightShape },
      };
      const state = {
        splitCalls: [] as Array<{ shape: unknown; tools: unknown[] }>,
        selections: [] as Array<{ ownerKey: string; hasLedgerPlan: boolean }>,
      };
      const ctx = makeBooleanContext(leftSelection, rightSelection, state);
      const upstream: KernelResult = { outputs: new Map(), selections: [leftSelection, rightSelection] };

      const result = execBoolean(
        ctx,
        {
          kind: "feature.boolean",
          id: "boolean-1",
          op: "subtract",
          left: selectors.selectorNamed("body:left"),
          right: selectors.selectorNamed("body:right"),
          result: "body:result",
        },
        upstream
      );

      assert.equal(state.splitCalls.length, 1);
      assert.deepEqual(state.splitCalls[0], {
        shape: {
          tag: "shape",
          shape: {
            tag: "builder",
            op: "subtract",
            left: leftShape,
            right: rightShape,
          },
        },
        tools: [leftShape, rightShape],
      });
      assert.deepEqual(result.outputs.get("body:result")?.meta["shape"], {
        tag: "normalized",
        shape: {
          tag: "split",
          shape: {
            tag: "shape",
            shape: {
              tag: "builder",
              op: "subtract",
              left: leftShape,
              right: rightShape,
            },
          },
          tools: [leftShape, rightShape],
        },
      });
      assert.deepEqual(state.selections, [{ ownerKey: "body:result", hasLedgerPlan: true }]);
    },
  },
  {
    name: "boolean module: rejects inputs that do not resolve to owned solids",
    fn: async () => {
      const leftSelection: KernelSelection = {
        id: "body:left",
        kind: "solid",
        meta: { shape: { tag: "left-shape" } },
      };
      const rightSelection: KernelSelection = {
        id: "face:right",
        kind: "face",
        meta: { shape: { tag: "right-face" } },
      };
      const ctx = {
        ...makeBooleanContext(leftSelection, rightSelection, {
          splitCalls: [],
          selections: [],
        }),
        resolveOwnerShape: (selection: KernelSelection) =>
          selection.kind === "solid" ? (selection.meta["shape"] as object) : null,
      } satisfies BooleanContext;
      const upstream: KernelResult = { outputs: new Map(), selections: [leftSelection, rightSelection] };

      assert.throws(
        () =>
          execBoolean(
            ctx,
            {
              kind: "feature.boolean",
              id: "boolean-1",
              op: "union",
              left: selectors.selectorNamed("body:left"),
              right: selectors.selectorNamed("body:right"),
              result: "body:result",
            },
            upstream
          ),
        /inputs must resolve to solids/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
