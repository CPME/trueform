import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { resolveSelector, resolveSelectorSet } from "../selectors.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "selectors: auto-disambiguates by area then center",
    fn: async () => {
      const selector = dsl.selectorFace([dsl.predPlanar()]);
      const ctx = {
        selections: [
          {
            id: "face-small",
            kind: "face" as const,
            meta: { planar: true, area: 5, center: [0, 0, 10], centerZ: 10 },
          },
          {
            id: "face-large",
            kind: "face" as const,
            meta: { planar: true, area: 12, center: [0, 0, 0], centerZ: 0 },
          },
        ],
        named: new Map(),
      };
      const resolved = resolveSelector(selector, ctx);
      assert.equal(resolved.id, "face-large");
    },
  },
  {
    name: "selectors: auto-disambiguates by center when area ties",
    fn: async () => {
      const selector = dsl.selectorFace([dsl.predPlanar()]);
      const ctx = {
        selections: [
          {
            id: "face-low",
            kind: "face" as const,
            meta: { planar: true, area: 10, center: [0, 0, -2], centerZ: -2 },
          },
          {
            id: "face-high",
            kind: "face" as const,
            meta: { planar: true, area: 10, center: [0, 0, 3], centerZ: 3 },
          },
        ],
        named: new Map(),
      };
      const resolved = resolveSelector(selector, ctx);
      assert.equal(resolved.id, "face-high");
    },
  },
  {
    name: "selectors: resolves multi-id selector.named target lists",
    fn: async () => {
      const selector = dsl.selectorNamed("edge:11, edge:12");
      const ctx = {
        selections: [
          {
            id: "edge:11",
            kind: "edge" as const,
            meta: { center: [0, 0, 0] },
          },
          {
            id: "edge:12",
            kind: "edge" as const,
            meta: { center: [1, 0, 0] },
          },
        ],
        named: new Map(),
      };
      const resolved = resolveSelectorSet(selector, ctx);
      assert.deepEqual(
        resolved.map((entry) => entry.id),
        ["edge:11", "edge:12"]
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
