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
    name: "occt parity probe: split body with planar tool",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("split-probe", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(20, 12) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
          "sketch-base",
        ]),
        dsl.plane("split-plane", 24, 16, "surface:splitter", {
          origin: [0, 0, 4],
          deps: ["base-extrude"],
        }),
        dsl.splitBody(
          "split-body",
          dsl.selectorNamed("body:main"),
          dsl.selectorNamed("surface:splitter"),
          "body:split",
          ["base-extrude", "split-plane"]
        ),
      ]);

      const result = buildPart(part, backend);
      const splitBody = result.final.outputs.get("body:split");
      assert.ok(splitBody, "missing split result body");
      const shape = splitBody.meta["shape"] as any;
      assert.ok(shape, "missing split result shape");
      assertValidShape(occt, shape, "split result");
      const solids = countSolids(occt, shape);
      assert.ok(solids >= 2, `expected split result to contain >= 2 solids, got ${solids}`);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
