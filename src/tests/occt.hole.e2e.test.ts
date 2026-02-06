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
    name: "occt e2e: hole cuts through planar face",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("plate", [
        dsl.extrude("base", dsl.profileRect(80, 40), 10, "body:main"),
        dsl.hole(
          "hole-1",
          dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()]),
          "-Z",
          10,
          "throughAll",
          { deps: ["base"] }
        ),
      ]);

      const result = buildPart(part, backend);
      const baseStep = result.steps[0];
      const holeStep = result.steps[1];
      assert.ok(baseStep && holeStep, "expected base and hole steps");

      const baseBody = baseStep.result.outputs.get("body:main");
      const finalBody = result.final.outputs.get("body:main");
      assert.ok(baseBody, "missing base body:main output");
      assert.ok(finalBody, "missing final body:main output");

      const baseShape = baseBody.meta["shape"] as any;
      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(baseShape, "missing base shape metadata");
      assert.ok(finalShape, "missing final shape metadata");
      assertValidShape(occt, baseShape, "base solid");
      assertValidShape(occt, finalShape, "hole solid");

      const baseFaces = countFaces(occt, baseShape);
      const finalFaces = countFaces(occt, finalShape);
      assert.ok(
        finalFaces > baseFaces,
        `expected hole to add faces (base=${baseFaces}, final=${finalFaces})`
      );
      const solidCount = countSolids(occt, finalShape);
      assert.equal(solidCount, 1, "expected a single solid output");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
