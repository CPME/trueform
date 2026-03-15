import assert from "node:assert/strict";
import { dslFeatureExamples } from "../examples/dsl_feature_examples.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "dsl feature examples: boolean previews use consistent ghost tint layering",
    fn: async () => {
      const ids = ["boolean", "boolean-cut", "boolean-intersect"];
      for (const id of ids) {
        const example = dslFeatureExamples.find((entry) => entry.id === id);
        assert.ok(example, `missing ${id} example`);
        assert.ok(example.render?.layers, `${id} example should define render layers`);
        assert.equal(example.render.layers.length, 3, `${id} should keep three render layers`);
        assert.equal(
          example.render.layers[0]?.screenSpaceTint,
          true,
          `${id} base/source layer should use screen-space tint`
        );
        assert.equal(
          example.render.layers[1]?.screenSpaceTint,
          true,
          `${id} tool/source layer should use screen-space tint`
        );
        assert.equal(
          example.render.layers[0]?.color?.join(","),
          "66,133,244",
          `${id} should keep the blue base/source tint`
        );
        assert.equal(
          example.render.layers[1]?.color?.join(","),
          "251,188,5",
          `${id} should keep the amber tool/source tint`
        );
        assert.equal(
          example.render.layers[2]?.color?.join(","),
          "52,168,83",
          `${id} should keep the green result body`
        );
      }
    },
  },
  {
    name: "dsl feature examples: boolean intersect keeps translucent operand overlays depth-tested",
    fn: async () => {
      const example = dslFeatureExamples.find((entry) => entry.id === "boolean-intersect");
      assert.ok(example, "missing boolean-intersect example");
      assert.ok(example.render?.layers, "boolean-intersect example should define render layers");
      assert.equal(example.render.layers.length, 3, "boolean-intersect should keep three render layers");
      assert.equal(
        example.render.layers[0]?.alpha,
        0.2,
        "left operand layer should remain translucent"
      );
      assert.equal(
        example.render.layers[1]?.alpha,
        0.2,
        "right operand layer should remain translucent"
      );
      assert.equal(
        example.render.layers[0]?.depthTest,
        true,
        "left operand overlay should stay depth-tested"
      );
      assert.equal(
        example.render.layers[1]?.depthTest,
        true,
        "right operand overlay should stay depth-tested"
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
