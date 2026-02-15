import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertPositiveVolume,
  assertValidShape,
  countEdges,
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

      const baseline = dsl.part("thread-baseline", [
        dsl.extrude("base", dsl.profileCircle(4), 12, "body:main"),
      ]);
      const baselineResult = buildPart(baseline, backend);
      const baselineOutput = baselineResult.final.outputs.get("body:main");
      assert.ok(baselineOutput, "missing baseline output");
      const baselineShape = baselineOutput.meta["shape"] as any;
      assert.ok(baselineShape, "missing baseline shape metadata");
      assertValidShape(occt, baselineShape, "baseline shape");

      assert.ok(
        countEdges(occt, shape) > countEdges(occt, baselineShape),
        "expected helical thread topology vs smooth cylinder"
      );
    },
  },
  {
    name: "occt e2e: thread docs example parameters remain valid",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("thread-docs-scale", [
        dsl.thread("thread-1", "+Z", 24, 22, 3.5, "body:main", undefined, {
          segmentsPerTurn: 12,
        }),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing thread output");
      assert.equal(output.kind, "solid");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing thread shape metadata");
      assertValidShape(occt, shape, "docs-scale thread shape");
      assert.ok(countSolids(occt, shape) >= 1, "expected docs-scale thread solid");
      assertPositiveVolume(occt, shape, "docs-scale thread shape");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
