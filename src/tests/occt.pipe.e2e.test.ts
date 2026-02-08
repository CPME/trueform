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
    name: "occt e2e: pipe feature produces hollow cylinder",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("pipe", [
        dsl.pipe("pipe-1", "+Z", 80, 60, 40, "body:main"),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "pipe solid");
      assertPositiveVolume(occt, shape, "pipe solid");

      const faceCount = countFaces(occt, shape);
      assert.ok(faceCount >= 4, `expected multiple faces, got ${faceCount}`);
    },
  },
  {
    name: "occt e2e: pipe rejects negative inner diameter",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("pipe-negative-inner", [
        dsl.pipe("pipe-1", "+Z", 80, 60, -10, "body:main"),
      ]);

      assert.throws(
        () => buildPart(part, backend),
        /pipe inner diameter must be non-negative/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
