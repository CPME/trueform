import assert from "node:assert/strict";
import { normalizePart } from "../compiler.js";
import { buildSketchSvg } from "../sketch/svg.js";
import { sketchFeatureExamples } from "../examples/sketch_feature_examples.js";
import { runTests } from "./occt_test_utils.js";

const tests = sketchFeatureExamples.map((example) => ({
  name: `docs sketch examples: renders ${example.id}`,
  fn: async () => {
    const normalized = normalizePart(example.part);
    const sketch = normalized.features.find((f) => f.kind === "feature.sketch2d");
    assert.ok(sketch, `missing sketch2d feature for ${example.id}`);
    const entities = (sketch as any).entities ?? [];
    const svg = buildSketchSvg(entities, {
      theme: {
        background: null,
        stroke: "#e6f1ff",
        constructionStroke: "#9fb0d1",
        pointStroke: "#e6f1ff",
        pointFill: "#e6f1ff",
      },
    });
    assert.ok(svg.startsWith("<?xml"), "svg should start with xml header");
    assert.ok(svg.includes("<svg"), "svg should contain <svg>");
  },
}));

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
