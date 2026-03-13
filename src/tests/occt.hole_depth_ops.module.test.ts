import assert from "node:assert/strict";
import type { Hole } from "../ir.js";
import {
  resolveHoleDepth,
  resolveHoleEndCondition,
  type HoleDepthDeps,
} from "../occt/hole_depth_ops.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(bounds: Array<{ min: number; max: number }>): HoleDepthDeps {
  class Explorer {
    private index = 0;
    private solids: any[] = [];
    Init(shape: { solids?: any[] }) {
      this.solids = shape.solids ?? [];
      this.index = 0;
    }
    More() {
      return this.index < this.solids.length;
    }
    Next() {
      this.index += 1;
    }
    Current() {
      return this.solids[this.index];
    }
  }

  return {
    occt: {
      TopExp_Explorer_1: Explorer,
      TopAbs_ShapeEnum: {
        TopAbs_SOLID: 1,
        TopAbs_SHAPE: 2,
      },
    },
    shapeBounds: (shape: { bounds?: { min: [number, number, number]; max: [number, number, number] } }) =>
      shape.bounds ?? { min: [0, 0, 0], max: [0, 0, 0] },
    axisBounds: (_axis, shapeBounds) => ({ min: shapeBounds.min[2], max: shapeBounds.max[2] }),
    throughAllDepth: () => 42,
    readShape: (shape) => shape,
    makeCylinder: (radius, height, axisDir, origin) => ({ kind: "cylinder", radius, height, axisDir, origin }),
    makeBoolean: () => ({
      solids: bounds.map((bound) => ({
        bounds: { min: [0, 0, bound.min], max: [0, 0, bound.max] },
      })),
    }),
  };
}

const tests = [
  {
    name: "hole depth ops: resolve wizard and through-all end conditions",
    fn: async () => {
      assert.equal(
        resolveHoleEndCondition({
          kind: "feature.hole",
          id: "hole-1",
          onFace: { kind: "selector.named", name: "face:top" },
          axis: "-Z",
          diameter: 10,
          depth: "throughAll",
        } as Hole),
        "throughAll"
      );
      assert.equal(
        resolveHoleEndCondition({
          kind: "feature.hole",
          id: "hole-2",
          onFace: { kind: "selector.named", name: "face:top" },
          axis: "-Z",
          diameter: 10,
          depth: 5,
          wizard: { endCondition: "upToNext" },
        } as Hole),
        "upToNext"
      );
    },
  },
  {
    name: "hole depth ops: blind holes keep normalized numeric depth",
    fn: async () => {
      const depth = resolveHoleDepth(
        makeDeps([]),
        {
          kind: "feature.hole",
          id: "hole-1",
          onFace: { kind: "selector.named", name: "face:top" },
          axis: "-Z",
          diameter: 10,
          depth: 8,
        } as Hole,
        { bounds: { min: [0, 0, 0], max: [0, 0, 10] } },
        [0, 0, 1],
        [0, 0, 0],
        5,
        "blind"
      );

      assert.equal(depth, 8);
    },
  },
  {
    name: "hole depth ops: through-all and up-to-next derive depth from probe and bounds ranges",
    fn: async () => {
      const owner = { bounds: { min: [0, 0, 0], max: [0, 0, 10] } };
      const throughAllDepth = resolveHoleDepth(
        makeDeps([{ min: 0, max: 6 }, { min: 0, max: 10 }]),
        {
          kind: "feature.hole",
          id: "hole-through",
          onFace: { kind: "selector.named", name: "face:top" },
          axis: "-Z",
          diameter: 10,
          depth: "throughAll",
        } as Hole,
        owner,
        [0, 0, 1],
        [0, 0, 0],
        5,
        "throughAll"
      );
      const upToNextDepth = resolveHoleDepth(
        makeDeps([{ min: 0, max: 6 }, { min: 0, max: 10 }]),
        {
          kind: "feature.hole",
          id: "hole-next",
          onFace: { kind: "selector.named", name: "face:top" },
          axis: "-Z",
          diameter: 10,
          depth: "throughAll",
        } as Hole,
        owner,
        [0, 0, 1],
        [0, 0, 0],
        5,
        "upToNext"
      );

      assert.ok(Math.abs(throughAllDepth - 10.2) < 1e-6);
      assert.ok(Math.abs(upToNextDepth - 6.12) < 1e-6);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
