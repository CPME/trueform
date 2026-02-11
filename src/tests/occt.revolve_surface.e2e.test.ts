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
    name: "occt e2e: revolve surface from open sketch produces face output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const line = dsl.sketchLine("line-1", [0, 0], [0, 10]);
      const sketch = dsl.sketch2d(
        "sketch-open",
        [
          {
            name: "profile:open",
            profile: dsl.profileSketchLoop(["line-1"], { open: true }),
          },
        ],
        { entities: [line] }
      );
      const part = dsl.part("revolve-surface", [
        sketch,
        dsl.revolve(
          "revolve-1",
          dsl.profileRef("profile:open"),
          "+Z",
          "full",
          "surface:main",
          { mode: "surface" }
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:main");
      assert.ok(output, "missing surface output");
      assert.equal(output.kind, "surface");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "revolve surface");
      assert.equal(countSolids(occt, shape), 0);
      assert.ok(countFaces(occt, shape) > 0, "expected surface to have faces");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
