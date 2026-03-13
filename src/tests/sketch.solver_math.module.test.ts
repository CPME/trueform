import assert from "node:assert/strict";
import { CompileError } from "../errors.js";
import {
  angleBetween,
  buildNormalMatrix,
  chooseClosestDirection,
  lineDirection,
  solveLinearSystem,
} from "../sketch/solver_math.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch solver math: solves linear systems and builds symmetric normal matrices",
    fn: async () => {
      assert.deepEqual(solveLinearSystem([[2, 0], [0, 4]], [6, 8]), [3, 2]);
      assert.deepEqual(buildNormalMatrix([[1, 2], [3, 4]]), [
        [10, 14],
        [14, 20],
      ]);
    },
  },
  {
    name: "sketch solver math: line direction rejects zero-length references",
    fn: async () => {
      assert.throws(
        () => lineDirection([1, 1], [1, 1], "sk1", "c1"),
        (error: unknown) =>
          error instanceof CompileError &&
          error.code === "sketch_constraint_invalid_reference"
      );
    },
  },
  {
    name: "sketch solver math: chooses closest direction and computes angles",
    fn: async () => {
      assert.deepEqual(chooseClosestDirection([[1, 0], [-1, 0]], [0.2, 0]), [1, 0]);
      assert.ok(Math.abs(angleBetween([1, 0], [0, 1]) - Math.PI / 2) < 1e-9);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
