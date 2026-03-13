import assert from "node:assert/strict";
import { CompileError } from "../errors.js";
import {
  validateAssembly,
  validateConnector,
  validateContext,
  validateParam,
} from "../validation/ir_validation_structure.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "ir structure validation: context and params validate happy path",
    fn: async () => {
      validateContext({
        units: "mm",
        kernel: { name: "occt", version: "1" },
        tolerance: { linear: 0.01, angular: 0.1 },
      } as any);
      validateParam({ id: "p1", type: "length", value: { kind: "expr.literal", value: 5 } } as any);
    },
  },
  {
    name: "ir structure validation: connector requires anchored selector",
    fn: async () => {
      assert.throws(
        () =>
          validateConnector({
            id: "c1",
            origin: { kind: "selector.face", predicates: [{ kind: "pred.planar" }], rank: [] },
          } as any),
        (error: unknown) =>
          error instanceof CompileError && error.code === "validation_connector_anchor"
      );
    },
  },
  {
    name: "ir structure validation: assembly refs require known parts and connectors",
    fn: async () => {
      assert.throws(
        () =>
          validateAssembly(
            {
              id: "a1",
              instances: [{ id: "i1", part: "missing" }],
            } as any,
            new Set(["part1"]),
            new Map([["part1", new Set(["origin"])]])
          ),
        (error: unknown) =>
          error instanceof CompileError &&
          error.code === "validation_assembly_instance_part_missing"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
