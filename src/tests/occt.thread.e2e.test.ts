import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertPositiveVolume,
  assertValidShape,
  countFaces,
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
        dsl.thread("thread-1", "+Z", 10, 8, 2, "body:main", undefined, {
          minorDiameter: 6.5,
          segmentsPerTurn: 6,
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
          segmentsPerTurn: 6,
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
  {
    name: "occt e2e: left-handed thread remains valid and topology-consistent",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const commonOpts = { minorDiameter: 6.5, segmentsPerTurn: 6 };
      const rightPart = dsl.part("thread-right", [
        dsl.thread("thread-1", "+Z", 10, 8, 2, "body:main", undefined, {
          ...commonOpts,
          handedness: "right",
        }),
      ]);
      const leftPart = dsl.part("thread-left", [
        dsl.thread("thread-1", "+Z", 10, 8, 2, "body:main", undefined, {
          ...commonOpts,
          handedness: "left",
        }),
      ]);

      const right = buildPart(rightPart, backend).final.outputs.get("body:main");
      const left = buildPart(leftPart, backend).final.outputs.get("body:main");
      assert.ok(right && left, "missing thread output(s)");
      const rightShape = right.meta["shape"] as any;
      const leftShape = left.meta["shape"] as any;
      assert.ok(rightShape && leftShape, "missing shape metadata");

      assertValidShape(occt, rightShape, "right-handed thread");
      assertValidShape(occt, leftShape, "left-handed thread");
      assertPositiveVolume(occt, rightShape, "right-handed thread");
      assertPositiveVolume(occt, leftShape, "left-handed thread");

      assert.equal(
        countFaces(occt, rightShape),
        countFaces(occt, leftShape),
        "expected handedness flip to preserve face count"
      );
      assert.equal(
        countEdges(occt, rightShape),
        countEdges(occt, leftShape),
        "expected handedness flip to preserve edge count"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
