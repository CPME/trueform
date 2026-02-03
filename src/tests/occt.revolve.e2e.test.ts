import assert from "node:assert/strict";
import { buildPart, PartIR } from "../index.js";
import { countFaces, getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: revolve rectangle produces solid output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part: PartIR = {
        id: "ring",
        features: [
          {
            id: "ring-revolve",
            kind: "feature.revolve",
            profile: {
              kind: "profile.rectangle",
              width: 2,
              height: 4,
              center: [10, 0, 0],
            },
            axis: "+Z",
            result: "body:ring",
          },
        ],
      };

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:ring");
      assert.ok(body, "missing body:ring output");
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
