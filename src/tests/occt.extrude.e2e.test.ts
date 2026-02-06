import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countFaces,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: extrude rectangle produces solid output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("plate", [
        dsl.extrude(
          "base-extrude",
          dsl.profileRect(80, 40),
          8,
          "body:main"
        ),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      assert.equal(result.partId, "plate");
      assert.deepEqual(result.order, ["base-extrude"]);

      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      const isNull = typeof shape.IsNull === "function" ? shape.IsNull() : false;
      assert.equal(isNull, false, "expected non-null OCCT shape");
      assertValidShape(occt, shape, "extrude solid");

      const faceCount = countFaces(occt, shape);
      assert.ok(faceCount >= 5, `expected at least 5 faces, got ${faceCount}`);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
