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
    name: "occt e2e: fillet on cylinder edge adds faces",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("fillet-cylinder", [
        dsl.extrude("cyl", dsl.profileCircle(10), 20, "body:main"),
        dsl.fillet(
          "edge-fillet",
          dsl.selectorEdge(
            [dsl.predCreatedBy("cyl")],
            [dsl.rankMaxZ()]
          ),
          2,
          ["cyl"]
        ),
      ]);

      const result = buildPart(part, backend);
      const baseStep = result.steps[0];
      const filletStep = result.steps[1];
      assert.ok(baseStep && filletStep, "expected base and fillet steps");

      const baseBody = baseStep.result.outputs.get("body:main");
      const finalBody = result.final.outputs.get("body:main");
      assert.ok(baseBody, "missing base body:main output");
      assert.ok(finalBody, "missing final body:main output");

      const baseShape = baseBody.meta["shape"] as any;
      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(baseShape, "missing base shape metadata");
      assert.ok(finalShape, "missing final shape metadata");
      assertValidShape(occt, baseShape, "base solid");
      assertValidShape(occt, finalShape, "fillet solid");

      const baseFaces = countFaces(occt, baseShape);
      const finalFaces = countFaces(occt, finalShape);
      assert.ok(
        finalFaces > baseFaces,
        `expected fillet to add faces (base=${baseFaces}, final=${finalFaces})`
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
