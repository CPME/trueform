import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "dsl: tolerancing helpers",
    fn: async () => {
      const selector = dsl.selectorFace([dsl.predPlanar()]);
      const surface = dsl.refSurface(selector);
      const frame = dsl.refFrame(dsl.selectorFace([dsl.predNormal("+Z")]));

      assert.equal(surface.kind, "ref.surface");
      assert.equal(frame.kind, "ref.frame");

      const constraint = dsl.surfaceProfileConstraint("c-1", surface, 0.05, {
        referenceFrame: frame,
        capabilities: ["cap-1"],
        requirement: "req-1",
      });

      assert.equal(constraint.kind, "constraint.surfaceProfile");
      assert.equal(constraint.id, "c-1");
      assert.equal(constraint.tolerance, 0.05);
      assert.equal(constraint.referenceFrame?.kind, "ref.frame");
      assert.deepEqual(constraint.capabilities, ["cap-1"]);
      assert.equal(constraint.requirement, "req-1");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
