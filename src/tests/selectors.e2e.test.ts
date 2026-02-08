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
  {
    name: "selector: rank.closestTo selects nearest center",
    fn: async () => {
      const target = dsl.selectorFace([dsl.predRole("target")]);
      const selector = dsl.selectorFace(
        [dsl.predPlanar(), dsl.predRole("candidate")],
        [dsl.rankClosestTo(target)]
      );
      const ctx = {
        selections: [
          { id: "t", kind: "face", meta: { planar: true, role: "target", center: [0, 0, 0] } },
          { id: "f1", kind: "face", meta: { planar: true, role: "candidate", center: [10, 0, 0] } },
          { id: "f2", kind: "face", meta: { planar: true, role: "candidate", center: [2, 0, 0] } },
        ],
        named: new Map(),
      } satisfies ResolutionContext;
      const hit = resolveSelector(selector, ctx);
      assert.equal(hit.id, "f2");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
