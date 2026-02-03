import assert from "node:assert/strict";
import { buildPart, PartIR } from "../index.js";
import { countFaces, getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: extrude sketch profile ref produces solid output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part: PartIR = {
        id: "sketch-plate",
        features: [
          {
            id: "sketch-base",
            kind: "feature.sketch2d",
            profiles: [
              {
                name: "profile:base",
                profile: { kind: "profile.rectangle", width: 50, height: 30 },
              },
            ],
          },
          {
            id: "sketch-extrude",
            kind: "feature.extrude",
            profile: { kind: "profile.ref", name: "profile:base" },
            depth: 5,
            result: "body:sketch",
            deps: ["sketch-base"],
          },
        ],
      };

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:sketch");
      assert.ok(body, "missing body:sketch output");
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
