import assert from "node:assert/strict";
import { buildPart, PartIR } from "../index.js";
import { countFaces, getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: extrude rectangle produces solid output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part: PartIR = {
        id: "plate",
        features: [
          {
            id: "base-extrude",
            kind: "feature.extrude",
            profile: { kind: "profile.rectangle", width: 80, height: 40 },
            depth: 8,
            result: "body:main",
          },
        ],
      };

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      assert.equal(result.partId, "plate");
      assert.deepEqual(result.order, ["base-extrude"]);

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
