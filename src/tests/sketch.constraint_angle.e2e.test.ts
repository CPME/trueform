import assert from "node:assert/strict";
import { solveSketchConstraintsDetailed } from "../core.js";
import { dsl, Sketch2D, SketchLine } from "../dsl.js";
import { normalizePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch angle constraint: detailed solve rotates target line to requested angle",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-angle",
        [
          dsl.sketchLine("line-ref", [0, 0], [10, 0]),
          dsl.sketchLine("line-target", [0, 0], [8, 3]),
        ],
        [dsl.sketchConstraintAngle("c-angle", "line-ref", "line-target", 45)]
      );

      const line = report.entities.find((entity) => entity.id === "line-target") as SketchLine;
      assert.ok(line, "missing solved line-target");
      assert.ok(Math.abs((line.end[0] as number) - Math.sqrt(73 / 2)) < 1e-6);
      assert.ok(Math.abs((line.end[1] as number) - Math.sqrt(73 / 2)) < 1e-6);
      assert.equal(report.constraintStatus[0]?.status, "satisfied");
    },
  },
  {
    name: "sketch angle constraint: normalization solves and strips angle constraints",
    fn: async () => {
      const part = dsl.part("sketch-angle-normalize", [
        dsl.sketch2d("sketch-angle", [], {
          entities: [
            dsl.sketchLine("line-ref", [0, 0], [10, 0]),
            dsl.sketchLine("line-target", [5, 5], [12, 6]),
          ],
          constraints: [dsl.sketchConstraintAngle("c-angle", "line-ref", "line-target", 90)],
        }),
      ]);

      const normalized = normalizePart(part);
      const sketch = normalized.features[0] as Sketch2D;
      assert.equal("constraints" in sketch, false);

      const line = (sketch.entities ?? []).find((entity) => entity.id === "line-target") as SketchLine;
      assert.ok(line, "missing normalized line-target");
      assert.equal(line.end[0], 5);
      assert.ok(Math.abs((line.end[1] as number) - (5 + Math.sqrt(50))) < 1e-6);
    },
  },
  {
    name: "sketch angle constraint: rejects literal angles outside 0..180",
    fn: async () => {
      const part = dsl.part("sketch-angle-invalid", [
        dsl.sketch2d("sketch-angle", [], {
          entities: [
            dsl.sketchLine("line-ref", [0, 0], [10, 0]),
            dsl.sketchLine("line-target", [0, 0], [8, 3]),
          ],
          constraints: [dsl.sketchConstraintAngle("c-angle", "line-ref", "line-target", 181)],
        }),
      ]);

      assert.throws(
        () => normalizePart(part),
        /between 0 and 180/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
