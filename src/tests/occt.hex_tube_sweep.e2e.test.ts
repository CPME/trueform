import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertPositiveVolume,
  assertValidShape,
  countFaces,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: hex tube sweep follows 3D path",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const path = dsl.pathSpline([
        [0, 0, 0],
        [30, 0, 0],
        [60, 20, 10],
        [70, 40, 30],
      ]);
      const part = dsl.part("hex-tube-sweep", [
        dsl.hexTubeSweep("hex-sweep-1", path, 40, 30, "body:main"),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "hex tube sweep solid");
      assertPositiveVolume(occt, shape, "hex tube sweep solid");

      const faceCount = countFaces(occt, shape);
      assert.ok(faceCount >= 6, `expected multiple faces, got ${faceCount}`);
    },
  },
  {
    name: "occt e2e: hex tube sweep rejects negative inner across flats",
    fn: async () => {
      const { backend } = await getBackendContext();
      const path = dsl.pathSpline([
        [0, 0, 0],
        [30, 0, 0],
        [60, 20, 10],
        [70, 40, 30],
      ]);
      const part = dsl.part("hex-tube-sweep-negative-inner", [
        dsl.hexTubeSweep("hex-sweep-1", path, 40, -30, "body:main"),
      ]);

      assert.throws(
        () => buildPart(part, backend),
        /hex tube sweep inneracrossflats must be non-negative/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
