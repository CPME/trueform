import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertPositiveVolume,
  assertValidShape,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: thread produces a solid",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("thread-test", [
        dsl.thread("thread-1", "+Z", 12, 8, 1.5, "body:main", undefined, {
          minorDiameter: 6.5,
          segmentsPerTurn: 12,
        }),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing thread output");
      assert.equal(output.kind, "solid");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "thread shape");
      assert.ok(countSolids(occt, shape) >= 1, "expected solid thread");
      assertPositiveVolume(occt, shape, "thread shape");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
