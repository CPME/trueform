import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { countFaces, getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: extrude sketch profile ref produces solid output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("sketch-plate", [
        dsl.sketch2d("sketch-base", [
          {
            name: "profile:base",
            profile: dsl.profileRect(50, 30),
          },
        ]),
        dsl.extrude(
          "sketch-extrude",
          dsl.profileRef("profile:base"),
          5,
          "body:main",
          ["sketch-base"]
        ),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      assert.equal(result.partId, "sketch-plate");
      assert.deepEqual(result.order, ["sketch-base", "sketch-extrude"]);

      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      const isNull = typeof shape.IsNull === "function" ? shape.IsNull() : false;
      assert.equal(isNull, false, "expected non-null OCCT shape");

      const faceCount = countFaces(occt, shape);
      assert.ok(faceCount >= 5, `expected at least 5 faces, got ${faceCount}`);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
