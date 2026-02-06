import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countFaces,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: boolean union produces solid output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("boolean-union", [
        dsl.extrude("base", dsl.profileRect(40, 20), 10, "body:base"),
        dsl.extrude(
          "tool",
          dsl.profileRect(20, 20, [10, 0, 0]),
          10,
          "body:tool"
        ),
        dsl.booleanOp(
          "union-1",
          "union",
          dsl.selectorNamed("body:base"),
          dsl.selectorNamed("body:tool"),
          "body:main",
          ["base", "tool"]
        ),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      const isNull = typeof shape.IsNull === "function" ? shape.IsNull() : false;
      assert.equal(isNull, false, "expected non-null OCCT shape");
      assertValidShape(occt, shape, "boolean union solid");

      const faceCount = countFaces(occt, shape);
      assert.ok(faceCount > 0, "expected at least one face");
      const solidCount = countSolids(occt, shape);
      assert.equal(solidCount, 1, "expected a single solid output");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
