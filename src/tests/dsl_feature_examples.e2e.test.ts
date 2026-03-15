import assert from "node:assert/strict";
import { dslFeatureExamples } from "../examples/dsl_feature_examples.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "dsl feature examples: boolean intersect ghost layers do not occlude the result body",
    fn: async () => {
      const example = dslFeatureExamples.find((entry) => entry.id === "boolean-intersect");
      assert.ok(example, "missing boolean-intersect example");
      assert.ok(example.render?.layers, "boolean-intersect example should define render layers");
      assert.equal(example.render.layers.length, 3, "boolean-intersect should keep three render layers");
      assert.equal(
        example.render.layers[0]?.depthTest,
        false,
        "left operand ghost layer should render as an underlay"
      );
      assert.equal(
        example.render.layers[1]?.depthTest,
        false,
        "right operand ghost layer should render as an underlay"
      );
      assert.equal(
        example.render.layers[2]?.depthTest,
        true,
        "intersection result should remain depth-tested"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
