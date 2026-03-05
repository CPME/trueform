import assert from "node:assert/strict";
import { solveSketchConstraintsDetailed } from "../core.js";
import { dsl, Sketch2D, SketchPoint } from "../dsl.js";
import { normalizePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch midpoint constraint: detailed solve places point at line midpoint",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-midpoint",
        [
          dsl.sketchLine("line-1", [0, 0], [10, 4]),
          dsl.sketchPoint("point-1", [9, 9]),
        ],
        [dsl.sketchConstraintMidpoint("c-midpoint", dsl.sketchPointRef("point-1"), "line-1")]
      );

      const point = report.entities.find((entity) => entity.id === "point-1") as SketchPoint;
      assert.ok(point, "missing solved point-1");
      assert.deepEqual(point.point, [5, 2]);
      assert.equal(report.constraintStatus[0]?.status, "satisfied");
    },
  },
  {
    name: "sketch midpoint constraint: normalization solves and strips midpoint constraints",
    fn: async () => {
      const part = dsl.part("sketch-midpoint-normalize", [
        dsl.sketch2d("sketch-midpoint", [], {
          entities: [
            dsl.sketchLine("line-1", [1, 1], [9, 5]),
            dsl.sketchPoint("point-1", [0, 0]),
          ],
          constraints: [
            dsl.sketchConstraintMidpoint("c-midpoint", dsl.sketchPointRef("point-1"), "line-1"),
          ],
        }),
      ]);

      const normalized = normalizePart(part);
      const sketch = normalized.features[0] as Sketch2D;
      assert.equal("constraints" in sketch, false);

      const point = (sketch.entities ?? []).find((entity) => entity.id === "point-1") as SketchPoint;
      assert.ok(point, "missing normalized point-1");
      assert.deepEqual(point.point, [5, 3]);
    },
  },
  {
    name: "sketch midpoint constraint: rejects non-line references",
    fn: async () => {
      const part = dsl.part("sketch-midpoint-invalid", [
        dsl.sketch2d("sketch-midpoint", [], {
          entities: [
            dsl.sketchPoint("point-1", [0, 0]),
            dsl.sketchPoint("point-2", [2, 4]),
          ],
          constraints: [
            dsl.sketchConstraintMidpoint("c-midpoint", dsl.sketchPointRef("point-1"), "point-2"),
          ],
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
