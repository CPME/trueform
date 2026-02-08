import assert from "node:assert/strict";
import { normalizePart } from "../compiler.js";
import { sketchPrimitivesPart } from "../examples/sketch_primitives.js";
import { buildSketchDxf } from "../sketch/dxf.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "export dxf: emits entities section",
    fn: async () => {
      const normalized = normalizePart(sketchPrimitivesPart);
      const sketch = normalized.features.find((f) => f.kind === "feature.sketch2d");
      assert.ok(sketch, "missing sketch2d feature");
      const entities = (sketch as any).entities ?? [];
      const dxf = buildSketchDxf(entities, { unit: "mm" });
      assert.ok(dxf.includes("SECTION"), "DXF missing SECTION");
      assert.ok(dxf.includes("ENTITIES"), "DXF missing ENTITIES section");
      assert.ok(dxf.includes("LWPOLYLINE") || dxf.includes("LINE"), "DXF missing geometry entities");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
