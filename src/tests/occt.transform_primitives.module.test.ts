import assert from "node:assert/strict";
import {
  mirrorShape,
  transformShapeRotate,
  transformShapeScale,
  transformShapeTranslate,
  type TransformPrimitiveContext,
} from "../occt/transform_primitives.js";
import { runTests } from "./occt_test_utils.js";

function makeTransformContext(state: { calls: Array<{ methods: string[]; args: unknown[][] }> }): TransformPrimitiveContext {
  return {
    callWithFallback: (_target, methods, argSets) => {
      state.calls.push({ methods, args: argSets });
      return undefined;
    },
    makeAx1: (origin, axis) => ({ origin, axis }),
    makeAx2WithXDir: (origin, normal, xDir) => ({ origin, normal, xDir }),
    makeDir: (x, y, z) => ({ x, y, z }),
    makePnt: (x, y, z) => ({ x, y, z }),
    makeVec: (x, y, z) => ({ x, y, z }),
    newOcct: (name, ...args) => ({ name, args }),
    readShape: (shape) => ({ tag: "shape", shape }),
    tryBuild: () => undefined,
  };
}

const tests = [
  {
    name: "transform primitives: translation uses gp_Trsf translation fallback set",
    fn: async () => {
      const state = { calls: [] as Array<{ methods: string[]; args: unknown[][] }> };
      const ctx = makeTransformContext(state);
      const result = transformShapeTranslate(ctx, { tag: "seed" }, [1, 2, 3]);

      assert.deepEqual(state.calls[0], {
        methods: ["SetTranslation", "SetTranslation_1", "SetTranslationPart"],
        args: [[{ x: 1, y: 2, z: 3 }]],
      });
      assert.deepEqual(result, {
        tag: "shape",
        shape: {
          name: "BRepBuilderAPI_Transform",
          args: [{ tag: "seed" }, { name: "gp_Trsf", args: [] }, true],
        },
      });
    },
  },
  {
    name: "transform primitives: scale rotate and mirror all use shared transform builder path",
    fn: async () => {
      const state = { calls: [] as Array<{ methods: string[]; args: unknown[][] }> };
      const ctx = makeTransformContext(state);
      transformShapeScale(ctx, { tag: "seed" }, [0, 0, 0], 2);
      transformShapeRotate(ctx, { tag: "seed" }, [0, 0, 0], [0, 0, 1], Math.PI / 2);
      mirrorShape(ctx, { tag: "seed" }, {
        origin: [0, 0, 0],
        normal: [1, 0, 0],
        xDir: [0, 1, 0],
        yDir: [0, 0, 1],
      });

      assert.deepEqual(state.calls.map((entry) => entry.methods[0]), [
        "SetScale",
        "SetRotation",
        "SetMirror",
      ]);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
