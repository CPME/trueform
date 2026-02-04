import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { resolveSelector, type ResolutionContext } from "../selectors.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "selector: ambiguous match throws",
    fn: async () => {
      const selector = dsl.selectorFace([dsl.predPlanar()]);
      const ctx = {
        selections: [
          { id: "f1", kind: "face", meta: { planar: true } },
          { id: "f2", kind: "face", meta: { planar: true } },
        ],
        named: new Map(),
      } satisfies ResolutionContext;
      assert.throws(() => resolveSelector(selector, ctx), /Selector ambiguity/);
    },
  },
  {
    name: "selector: missing predicate metadata throws",
    fn: async () => {
      const selector = dsl.selectorFace([dsl.predNormal("+Z")]);
      const ctx = {
        selections: [{ id: "f1", kind: "face", meta: { planar: true } }],
        named: new Map(),
      } satisfies ResolutionContext;
      assert.throws(() => resolveSelector(selector, ctx), /metadata normal/);
    },
  },
  {
    name: "selector: missing ranking metadata throws",
    fn: async () => {
      const selector = dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxArea()]);
      const ctx = {
        selections: [{ id: "f1", kind: "face", meta: { planar: true } }],
        named: new Map(),
      } satisfies ResolutionContext;
      assert.throws(() => resolveSelector(selector, ctx), /metadata area/);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
