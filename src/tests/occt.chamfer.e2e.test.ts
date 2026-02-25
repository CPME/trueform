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
    name: "occt e2e: chamfer on block edges adds faces",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("chamfer-block", [
        dsl.extrude("block", dsl.profileRect(30, 20), 10, "body:main"),
        dsl.chamfer(
          "edge-chamfer",
          dsl.selectorEdge([dsl.predCreatedBy("block")]),
          2,
          ["block"]
        ),
      ]);

      const result = buildPart(part, backend);
      const baseStep = result.steps[0];
      const chamferStep = result.steps[1];
      assert.ok(baseStep && chamferStep, "expected base and chamfer steps");

      const baseBody = baseStep.result.outputs.get("body:main");
      const finalBody = result.final.outputs.get("body:main");
      assert.ok(baseBody, "missing base body:main output");
      assert.ok(finalBody, "missing final body:main output");

      const baseShape = baseBody.meta["shape"] as any;
      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(baseShape, "missing base shape metadata");
      assert.ok(finalShape, "missing final shape metadata");
      assertValidShape(occt, baseShape, "base solid");
      assertValidShape(occt, finalShape, "chamfer solid");

      const baseFaces = countFaces(occt, baseShape);
      const finalFaces = countFaces(occt, finalShape);
      assert.ok(
        finalFaces > baseFaces,
        `expected chamfer to add faces (base=${baseFaces}, final=${finalFaces})`
      );
    },
  },
  {
    name: "occt e2e: chamfer can publish named result for downstream selectors",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("chamfer-named-result", [
        dsl.extrude("base", dsl.profileRect(20, 20), 8, "body:seed"),
        dsl.chamfer(
          "chamfer-1",
          dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMaxZ()]),
          1,
          { result: "body:chamfer-1" }
        ),
        dsl.extrude("tool", dsl.profileRect(8, 8, [6, 0, 0]), 8, "body:tool"),
        dsl.booleanOp(
          "union-1",
          "union",
          dsl.selectorNamed("body:chamfer-1"),
          dsl.selectorNamed("body:tool"),
          "body:main"
        ),
      ]);

      const result = buildPart(part, backend);
      const chamferBody = result.steps[1]?.result.outputs.get("body:chamfer-1");
      assert.ok(chamferBody, "missing chamfer named output");
      const finalBody = result.final.outputs.get("body:main");
      assert.ok(finalBody, "missing boolean output body:main");

      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(finalShape, "missing final shape metadata");
      assertValidShape(occt, finalShape, "chamfer named-output union solid");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
