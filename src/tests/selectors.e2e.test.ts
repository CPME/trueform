import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { CompileError } from "../errors.js";
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
  {
    name: "selectors: stable ids resolve directly",
    fn: async () => {
      const selector = dsl.selectorNamed("edge:body.main~base.hstable");
      const ctx = {
        selections: [
          {
            id: "edge:body.main~base.hstable",
            kind: "edge" as const,
            meta: { center: [0, 0, 0] },
          },
        ],
        named: new Map(),
      };
      const resolved = resolveSelector(selector, ctx);
      assert.equal(resolved.id, "edge:body.main~base.hstable");
    },
  },
  {
    name: "selectors: legacy numeric ids raise migration diagnostics",
    fn: async () => {
      const selector = dsl.selectorNamed("face:42");
      const ctx = {
        selections: [
          {
            id: "face:body.main~base.hseed",
            kind: "face" as const,
            meta: { planar: true, area: 10, center: [0, 0, 0], centerZ: 0 },
          },
        ],
        named: new Map(),
      };
      assert.throws(
        () => resolveSelector(selector, ctx),
        (err) =>
          err instanceof CompileError &&
          err.code === "selector_legacy_numeric_unsupported" &&
          err.details?.["referenceId"] === "face:42"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
