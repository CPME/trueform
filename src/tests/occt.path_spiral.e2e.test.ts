import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertPositiveVolume,
  assertValidShape,
  countEdges,
  countFaces,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt path spiral: pipe sweep builds a valid planar spiral solid",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("path-spiral", [
        dsl.pipeSweep(
          "spiral-pipe",
          dsl.pathSpiral({
            origin: [0, 0, 0],
            normal: [0, 0, 1],
            startRadius: 10,
            endRadius: 36,
            turns: 2,
            segmentsPerTurn: 60,
          }),
          4,
          undefined,
          "body:main"
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing spiral output");
      const shape = output.meta["shape"] as any;
      assertValidShape(occt, shape, "spiral pipe");
      assertPositiveVolume(occt, shape, "spiral pipe");
      assert.ok(countEdges(occt, shape) >= 3, "expected spiral pipe to contain edge topology");
      assert.ok(countFaces(occt, shape) >= 3, "expected spiral pipe to create faces");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
