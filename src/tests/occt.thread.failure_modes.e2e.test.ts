import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt failure modes: thread fails when pitch is non-positive",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("thread-failure-pitch", [
        dsl.thread("thread-1", "+Z", 12, 8, 0, "body:main"),
      ]);
      assert.throws(() => buildPart(part, backend), /thread pitch must be positive/i);
    },
  },
  {
    name: "occt failure modes: thread fails when minor diameter is not less than major diameter",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("thread-failure-minor", [
        dsl.thread("thread-1", "+Z", 12, 8, 1.5, "body:main", undefined, {
          minorDiameter: 8,
        }),
      ]);
      assert.throws(
        () => buildPart(part, backend),
        /minor diameter must be smaller than major diameter/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
