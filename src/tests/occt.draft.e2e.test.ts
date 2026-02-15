import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: draft applies taper to selected faces",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("draft-test", [
        dsl.extrude("base", dsl.profileRect(40, 20), 20, "body:base"),
        dsl.datumPlane("draft-neutral", "+Z", [0, 0, 0]),
        dsl.draft(
          "draft-1",
          dsl.selectorNamed("body:base"),
          dsl.selectorFace([
            dsl.predCreatedBy("base"),
            dsl.predPlanar(),
            dsl.predNormal("+X"),
          ]),
          dsl.planeDatum("draft-neutral"),
          "+Z",
          Math.PI / 60,
          "body:main",
          ["base", "draft-neutral"]
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing draft output");
      assert.equal(output.kind, "solid");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "draft solid");
      assert.ok(countSolids(occt, shape) >= 1, "expected solid output");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
