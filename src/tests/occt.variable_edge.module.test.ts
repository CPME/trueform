import assert from "node:assert/strict";
import type { KernelResult, KernelSelection } from "../backend.js";
import {
  executeVariableEdgeModifier,
  variableChamferEntries,
  variableFilletEntries,
} from "../occt/variable_edge_modifiers.js";
import * as selectors from "../dsl/selectors.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "variable edge module: deduplicates repeated edge matches before adding them",
    fn: async () => {
      const edgeShape = { tag: "edge-1" };
      const edgeSelection: KernelSelection = {
        id: "edge:1",
        kind: "edge",
        meta: { shape: edgeShape, ownerKey: "body:main" },
      };
      const sourceSelection: KernelSelection = {
        id: "body:main",
        kind: "solid",
        meta: { shape: { tag: "owner" }, ownerKey: "body:main" },
      };
      const upstream: KernelResult = { outputs: new Map(), selections: [sourceSelection, edgeSelection] };
      const added: Array<{ edge: unknown; value: number }> = [];

      const result = executeVariableEdgeModifier({
        label: "variable fillet",
        feature: {
          kind: "feature.fillet.variable",
          id: "fillet-var",
          source: selectors.selectorNamed("body:main"),
          entries: [
            { edge: selectors.selectorNamed("edge:1"), radius: 1.2 },
            { edge: selectors.selectorNamed("edge:1"), radius: 0.8 },
          ],
          result: "body:filleted",
        },
        upstream,
        ctx: {
          toResolutionContext: () => ({
            selections: [sourceSelection, edgeSelection],
            named: new Map([
              ["body:main", sourceSelection],
              ["edge:1", edgeSelection],
            ]),
          }),
          resolveOwnerKey: (selection) => String(selection.meta["ownerKey"] ?? ""),
          resolveOwnerShape: (selection) => selection.meta["shape"] as object,
          toEdge: (edge) => edge,
          containsShape: (shapes, candidate) => shapes.includes(candidate),
          tryBuild: () => undefined,
          readShape: () => ({ tag: "solid" }),
          collectSelections: () => [],
        },
        makeBuilder: () => ({ tag: "builder" }),
        entries: variableFilletEntries({
          kind: "feature.fillet.variable",
          id: "fillet-var",
          source: selectors.selectorNamed("body:main"),
          entries: [
            { edge: selectors.selectorNamed("edge:1"), radius: 1.2 },
            { edge: selectors.selectorNamed("edge:1"), radius: 0.8 },
          ],
          result: "body:filleted",
        }),
        addEdge: (_builder, edge, value) => {
          added.push({ edge, value });
          return true;
        },
      });

      assert.equal(added.length, 1);
      assert.deepEqual(added[0], { edge: edgeShape, value: 1.2 });
      assert.ok(result.outputs.get("body:filleted"), "missing variable fillet output");
    },
  },
  {
    name: "variable edge module: rejects edges owned by a different solid",
    fn: async () => {
      const sourceSelection: KernelSelection = {
        id: "body:main",
        kind: "solid",
        meta: { shape: { tag: "owner" }, ownerKey: "body:main" },
      };
      const foreignEdge: KernelSelection = {
        id: "edge:foreign",
        kind: "edge",
        meta: { shape: { tag: "edge" }, ownerKey: "body:other" },
      };
      const upstream: KernelResult = { outputs: new Map(), selections: [sourceSelection, foreignEdge] };
      const feature = {
        kind: "feature.chamfer.variable" as const,
        id: "chamfer-var",
        source: selectors.selectorNamed("body:main"),
        entries: [{ edge: selectors.selectorNamed("edge:foreign"), distance: 1.4 }],
        result: "body:chamfered",
      };

      assert.throws(
        () =>
          executeVariableEdgeModifier({
            label: "variable chamfer",
            feature,
            upstream,
            ctx: {
              toResolutionContext: () => ({
                selections: [sourceSelection, foreignEdge],
                named: new Map([
                  ["body:main", sourceSelection],
                  ["edge:foreign", foreignEdge],
                ]),
              }),
              resolveOwnerKey: (selection) => String(selection.meta["ownerKey"] ?? ""),
              resolveOwnerShape: (selection) => selection.meta["shape"] as object,
              toEdge: (edge) => edge,
              containsShape: (shapes, candidate) => shapes.includes(candidate),
              tryBuild: () => undefined,
              readShape: () => ({ tag: "solid" }),
              collectSelections: () => [],
            },
            makeBuilder: () => ({ tag: "builder" }),
            entries: variableChamferEntries(feature),
            addEdge: () => true,
          }),
        /must belong to source solid/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
