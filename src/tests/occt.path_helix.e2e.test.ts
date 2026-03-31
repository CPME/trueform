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
    name: "occt path helix: pipe sweep builds a valid helical solid",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("path-helix", [
        dsl.pipeSweep(
          "helix-pipe",
          dsl.pathHelix({
            origin: [0, 0, 0],
            axis: [0, 0, 1],
            radius: 12,
            pitch: 12,
            turns: 1.5,
            segmentsPerTurn: 24,
          }),
          4,
          undefined,
          "body:main"
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing helix output");
      const shape = output.meta["shape"] as any;
      assertValidShape(occt, shape, "helix pipe");
      assertPositiveVolume(occt, shape, "helix pipe");
      assert.ok(countEdges(occt, shape) >= 3, "expected helix pipe to contain edge topology");
      assert.ok(countFaces(occt, shape) >= 3, "expected helical pipe to create faces");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
