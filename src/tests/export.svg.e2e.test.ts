import assert from "node:assert/strict";
import { normalizePart } from "../compiler.js";
import { sketchPrimitivesPart } from "../examples/sketch_primitives.js";
import { buildSketchSvg } from "../sketch/svg.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "export svg: emits SVG document",
    fn: async () => {
      const normalized = normalizePart(sketchPrimitivesPart);
      const sketch = normalized.features.find((f) => f.kind === "feature.sketch2d");
      assert.ok(sketch, "missing sketch2d feature");
      const entities = (sketch as any).entities ?? [];
      const svg = buildSketchSvg(entities);
      assert.ok(svg.includes("<svg"), "SVG output missing <svg>");
      assert.ok(svg.includes("<path") || svg.includes("<circle"), "SVG output missing geometry");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
