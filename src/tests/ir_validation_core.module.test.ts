import assert from "node:assert/strict";
import { CompileError } from "../errors.js";
import {
  ensureTuple2,
  validateAxisSpec,
  validatePath3D,
  validateRankRule,
  validateSelector,
} from "../validation/ir_validation_core.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "ir core validation: selector and rank rule validation works",
    fn: async () => {
      validateSelector({ kind: "selector.named", name: "top" } as any);
      validateRankRule({
        kind: "rank.closestTo",
        target: { kind: "selector.named", name: "top" },
      } as any);
    },
  },
  {
    name: "ir core validation: path and axis validation reject invalid shapes",
    fn: async () => {
      assert.throws(
        () => validatePath3D({ kind: "path.polyline", points: [[0, 0, 0]] } as any, "Path"),
        (error: unknown) =>
          error instanceof CompileError && error.code === "validation_path_points"
      );
      assert.throws(
        () => validateAxisSpec({ kind: "axis.datum", ref: "" } as any, "Axis invalid"),
        (error: unknown) =>
          error instanceof CompileError && error.code === "validation_axis_datum"
      );
      assert.throws(
        () =>
          validatePath3D(
            { kind: "path.helix", origin: [0, 0, 0], axis: [0, 0, 1], radius: 4, pitch: 2 } as any,
            "Path"
          ),
        (error: unknown) =>
          error instanceof CompileError && error.code === "validation_path_helix_extent"
      );
      validatePath3D(
        {
          kind: "path.spiral",
          origin: [0, 0, 0],
          startRadius: 2,
          endRadius: 8,
          turns: 3,
          handedness: "left",
        } as any,
        "Path"
      );
    },
  },
  {
    name: "ir core validation: tuple validation rejects non-pairs",
    fn: async () => {
      assert.throws(
        () => ensureTuple2([1, 2, 3] as any, "pair"),
        (error: unknown) =>
          error instanceof CompileError && error.code === "validation_tuple2"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
