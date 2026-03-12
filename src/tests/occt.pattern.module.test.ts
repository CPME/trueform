import assert from "node:assert/strict";
import type { KernelResult, KernelSelection } from "../backend.js";
import { execPattern } from "../occt/pattern_ops.js";
import * as selectors from "../dsl/selectors.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "pattern module: linear feature pattern replicates the source body",
    fn: async () => {
      const faceSelection: KernelSelection = {
        id: "face:origin",
        kind: "face",
        meta: { shape: { tag: "face" } },
      };
      const solidSelection: KernelSelection = {
        id: "solid:source",
        kind: "solid",
        meta: { shape: { tag: "solid" } },
      };
      const upstream: KernelResult = { outputs: new Map(), selections: [faceSelection, solidSelection] };
      const deltas: Array<[number, number, number]> = [];
      let collectedOwnerKey = "";

      const result = execPattern({
        feature: {
          kind: "pattern.linear",
          id: "pattern-1",
          origin: selectors.selectorNamed("face:origin"),
          spacing: [10, 0],
          count: [2, 1],
          source: selectors.selectorNamed("solid:source"),
          result: "body:patterned",
        },
        upstream,
        resolve: (selector) => {
          const name = (selector as { name?: string }).name;
          if (name === "face:origin") return faceSelection;
          if (name === "solid:source") return solidSelection;
          throw new Error(`unexpected selector: ${name}`);
        },
        deps: {
          planeBasisFromFace: () => ({ origin: [0, 0, 0], normal: [0, 0, 1], xDir: [1, 0, 0], yDir: [0, 1, 0] }),
          faceCenter: () => [0, 0, 0],
          patternKey: (id) => `pattern:${id}`,
          resolveOwnerShape: () => ({ tag: "owner" }),
          transformShapeTranslate: (_shape, delta) => {
            deltas.push(delta);
            return { translated: delta };
          },
          transformShapeRotate: () => {
            throw new Error("rotation should not be used for linear pattern");
          },
          unionShapesBalanced: (shapes) => ({ shapes }),
          collectSelections: (_shape, _featureId, ownerKey) => {
            collectedOwnerKey = ownerKey;
            return [];
          },
        },
      });

      assert.equal(deltas.length, 1);
      assert.deepEqual(deltas[0], [10, 0, 0]);
      assert.equal(collectedOwnerKey, "body:patterned");
      assert.ok(result.outputs.get("body:patterned"), "missing patterned solid output");
      assert.ok(result.outputs.get("pattern:pattern-1"), "missing pattern metadata output");
    },
  },
  {
    name: "pattern module: feature source requires an explicit result key",
    fn: async () => {
      const faceSelection: KernelSelection = {
        id: "face:origin",
        kind: "face",
        meta: { shape: { tag: "face" } },
      };
      const solidSelection: KernelSelection = {
        id: "solid:source",
        kind: "solid",
        meta: { shape: { tag: "solid" } },
      };
      const upstream: KernelResult = { outputs: new Map(), selections: [faceSelection, solidSelection] };

      assert.throws(
        () =>
          execPattern({
            feature: {
              kind: "pattern.linear",
              id: "pattern-1",
              origin: selectors.selectorNamed("face:origin"),
              spacing: [10, 0],
              count: [2, 1],
              source: selectors.selectorNamed("solid:source"),
            },
            upstream,
            resolve: (selector) => {
              const name = (selector as { name?: string }).name;
              if (name === "face:origin") return faceSelection;
              if (name === "solid:source") return solidSelection;
              throw new Error(`unexpected selector: ${name}`);
            },
            deps: {
              planeBasisFromFace: () => ({ origin: [0, 0, 0], normal: [0, 0, 1], xDir: [1, 0, 0], yDir: [0, 1, 0] }),
              faceCenter: () => [0, 0, 0],
              patternKey: (id) => `pattern:${id}`,
              resolveOwnerShape: () => ({ tag: "owner" }),
              transformShapeTranslate: () => ({ translated: true }),
              transformShapeRotate: () => ({ rotated: true }),
              unionShapesBalanced: () => ({ merged: true }),
              collectSelections: () => [],
            },
          }),
        /pattern result is required/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
