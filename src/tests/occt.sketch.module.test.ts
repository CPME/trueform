import assert from "node:assert/strict";
import type { KernelResult, KernelSelection } from "../backend.js";
import type { SketchContext } from "../occt/operation_contexts.js";
import { execSketch } from "../occt/sketch_ops.js";
import { runTests } from "./occt_test_utils.js";

function makeSketchContext(state: {
  resolvedPlanes: number;
  wiresBuilt: number;
}): SketchContext {
  return {
    buildSketchProfileFaceFromWires: (outer, holes) => ({ tag: "face", outer, holes }),
    buildSketchWire: (loop) => ({ tag: "hole-wire", loop }),
    buildSketchWireWithStatus: (loop, _entityMap, _plane, allowOpen) => {
      state.wiresBuilt += 1;
      return { wire: { tag: allowOpen ? "open-wire" : "closed-wire", loop }, closed: !allowOpen };
    },
    resolveSketchPlane: () => {
      state.resolvedPlanes += 1;
      return {
        origin: [0, 0, 0],
        normal: [0, 0, 1],
        xDir: [1, 0, 0],
        yDir: [0, 1, 0],
      };
    },
    segmentSlotsForLoop: (loop) => loop.map((id) => `${id}.1`),
  };
}

const resolve = ((_selector: unknown, _upstream: KernelResult) => {
  throw new Error("unexpected selector resolution");
}) as (selector: any, upstream: KernelResult) => KernelSelection;

const tests = [
  {
    name: "sketch module: emits sketch-profile metadata for open loops and leaves primitive profiles untouched",
    fn: async () => {
      const state = { resolvedPlanes: 0, wiresBuilt: 0 };
      const ctx = makeSketchContext(state);
      const upstream: KernelResult = { outputs: new Map(), selections: [] };

      const result = execSketch(
        ctx,
        {
          kind: "feature.sketch2d",
          id: "sketch-1",
          profiles: [
            {
              name: "profile:open",
              profile: { kind: "profile.sketch", loop: ["line-1"], open: true },
            },
            {
              name: "profile:rect",
              profile: { kind: "profile.rectangle", width: 20, height: 10 },
            },
          ],
          entities: [{ kind: "sketch.line", id: "line-1", start: [0, 0], end: [10, 0] }],
        },
        upstream,
        resolve
      );

      assert.equal(state.resolvedPlanes, 1);
      assert.equal(state.wiresBuilt, 1);
      const open = result.outputs.get("profile:open");
      assert.ok(open, "missing open sketch profile");
      assert.deepEqual(open?.meta["wire"], { tag: "open-wire", loop: ["line-1"] });
      assert.equal(open?.meta["face"], undefined);
      assert.deepEqual(open?.meta["wireSegmentSlots"], ["line-1.1"]);
      assert.deepEqual(open?.meta["planeNormal"], [0, 0, 1]);
      const rect = result.outputs.get("profile:rect");
      assert.ok(rect, "missing rectangle profile");
      assert.deepEqual(rect?.meta, {
        profile: { kind: "profile.rectangle", width: 20, height: 10 },
      });
    },
  },
  {
    name: "sketch module: skips plane resolution when no sketch loop profiles are present",
    fn: async () => {
      const state = { resolvedPlanes: 0, wiresBuilt: 0 };
      const ctx = makeSketchContext(state);
      const upstream: KernelResult = { outputs: new Map(), selections: [] };

      const result = execSketch(
        ctx,
        {
          kind: "feature.sketch2d",
          id: "sketch-1",
          profiles: [
            {
              name: "profile:rect",
              profile: { kind: "profile.rectangle", width: 20, height: 10 },
            },
          ],
        },
        upstream,
        resolve
      );

      assert.equal(state.resolvedPlanes, 0);
      assert.equal(state.wiresBuilt, 0);
      assert.ok(result.outputs.get("profile:rect"), "missing rectangle profile output");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
