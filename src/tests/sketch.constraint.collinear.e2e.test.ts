import assert from "node:assert/strict";
import { solveSketchConstraintsDetailed } from "../core.js";
import { dsl, Sketch2D, SketchLine } from "../dsl.js";
import { normalizePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch collinear constraint: detailed solve aligns target line onto reference line",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-collinear",
        [
          dsl.sketchLine("line-ref", [0, 0], [10, 0]),
          dsl.sketchLine("line-target", [2, 3], [6, 8]),
        ],
        [dsl.sketchConstraintCollinear("c-collinear", "line-ref", "line-target")]
      );

      const line = report.entities.find((entity) => entity.id === "line-target") as SketchLine;
      assert.ok(line, "missing solved line-target");
      assert.ok(Math.abs((line.start[1] as number) - 0) < 1e-6);
      assert.ok(Math.abs((line.end[1] as number) - 0) < 1e-6);
      assert.equal(report.constraintStatus[0]?.status, "satisfied");
    },
  },
  {
    name: "sketch collinear constraint: normalization solves and strips collinear constraints",
    fn: async () => {
      const part = dsl.part("sketch-collinear-normalize", [
        dsl.sketch2d("sketch-collinear", [], {
          entities: [
            dsl.sketchLine("line-ref", [0, 0], [10, 0]),
            dsl.sketchLine("line-target", [4, 7], [7, 9]),
          ],
          constraints: [dsl.sketchConstraintCollinear("c-collinear", "line-ref", "line-target")],
        }),
      ]);

      const normalized = normalizePart(part);
      const sketch = normalized.features[0] as Sketch2D;
      assert.equal("constraints" in sketch, false);

      const line = (sketch.entities ?? []).find((entity) => entity.id === "line-target") as SketchLine;
      assert.ok(line, "missing normalized line-target");
      assert.ok(Math.abs((line.start[1] as number) - 0) < 1e-6);
      assert.ok(Math.abs((line.end[1] as number) - 0) < 1e-6);
    },
  },
  {
    name: "sketch collinear constraint: rejects non-line references",
    fn: async () => {
      const part = dsl.part("sketch-collinear-invalid", [
        dsl.sketch2d("sketch-collinear", [], {
          entities: [
            dsl.sketchLine("line-ref", [0, 0], [10, 0]),
            dsl.sketchPoint("point-1", [1, 2]),
          ],
          constraints: [dsl.sketchConstraintCollinear("c-collinear", "line-ref", "point-1")],
        }),
      ]);

      assert.throws(
        () => normalizePart(part),
        /must reference a sketch\.line/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
