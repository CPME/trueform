import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { countFaces, getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: revolve rectangle produces solid output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("ring", [
        dsl.revolve(
          "ring-revolve",
          dsl.profileRect(2, 4, [10, 0, 0]),
          "+Z",
          "full",
          "body:main"
        ),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      assert.equal(result.partId, "ring");
      assert.deepEqual(result.order, ["ring-revolve"]);

      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      const isNull = typeof shape.IsNull === "function" ? shape.IsNull() : false;
      assert.equal(isNull, false, "expected non-null OCCT shape");

      const faceCount = countFaces(occt, shape);
      assert.ok(faceCount >= 3, `expected at least 3 faces, got ${faceCount}`);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
