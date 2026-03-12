import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertPositiveVolume,
  assertValidShape,
  countFaces,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: sweep closed profile along polyline produces solid output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const path = dsl.pathPolyline([
        [0, 0, 0],
        [0, 0, 20],
        [10, 8, 30],
      ]);
      const part = dsl.part("sweep-solid", [
        dsl.sweep("sweep-1", dsl.profileCircle(4), path, "body:main"),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing body:main output");
      assert.equal(output.kind, "solid");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "sweep solid");
      assertPositiveVolume(occt, shape, "sweep solid");
      assert.equal(countSolids(occt, shape), 1, "expected a single solid");
      assert.ok(countFaces(occt, shape) > 0, "expected sweep solid to have faces");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
