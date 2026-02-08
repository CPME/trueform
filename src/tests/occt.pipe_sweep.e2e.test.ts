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
    name: "occt e2e: pipe sweep follows 3D path",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const path = dsl.pathSegments([
        dsl.pathArc([40, 0, 0], [0, 40, 0], [0, 0, 0], "ccw"),
      ]);
      const part = dsl.part("pipe-sweep", [
        dsl.pipeSweep("sweep-1", path, 20, 10, "body:main"),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "pipe sweep solid");
      assertPositiveVolume(occt, shape, "pipe sweep solid");

      const faceCount = countFaces(occt, shape);
      assert.ok(faceCount >= 4, `expected multiple faces, got ${faceCount}`);
    },
  },
  {
    name: "occt e2e: pipe sweep rejects negative inner diameter",
    fn: async () => {
      const { backend } = await getBackendContext();
      const path = dsl.pathSegments([
        dsl.pathArc([40, 0, 0], [0, 40, 0], [0, 0, 0], "ccw"),
      ]);
      const part = dsl.part("pipe-sweep-negative-inner", [
        dsl.pipeSweep("sweep-1", path, 20, -10, "body:main"),
      ]);

      assert.throws(
        () => buildPart(part, backend),
        /pipe sweep inner diameter must be non-negative/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
