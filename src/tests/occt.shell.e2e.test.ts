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
    name: "occt e2e: shell hollows a solid",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const topFace = dsl.selectorFace(
        [dsl.predCreatedBy("base"), dsl.predPlanar(), dsl.predNormal("+Z")],
        [dsl.rankMaxArea()]
      );
      const part = dsl.part("shell-test", [
        dsl.extrude("base", dsl.profileRect(60, 40), 20, "body:base"),
        dsl.shell(
          "shell-1",
          dsl.selectorNamed("body:base"),
          2,
          "body:main",
          undefined,
          { direction: "inside", openFaces: [topFace] }
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing shell output");
      assert.equal(output.kind, "solid");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "shell shape");
      assert.ok(countSolids(occt, shape) >= 1, "expected solid result");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
