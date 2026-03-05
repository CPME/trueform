import assert from "node:assert/strict";
import { solveSketchConstraintsDetailed } from "../core.js";
import { dsl, Sketch2D, SketchPoint } from "../dsl.js";
import { normalizePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch pointOnLine constraint: detailed solve projects a point onto line",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-point-on-line",
        [
          dsl.sketchLine("line-1", [0, 0], [10, 10]),
          dsl.sketchPoint("point-1", [8, 2]),
        ],
        [dsl.sketchConstraintPointOnLine("c-point-line", dsl.sketchPointRef("point-1"), "line-1")]
      );

      const point = report.entities.find((entity) => entity.id === "point-1") as SketchPoint;
      assert.ok(point, "missing solved point-1");
      assert.ok(Math.abs((point.point[0] as number) - 5) < 1e-6);
      assert.ok(Math.abs((point.point[1] as number) - 5) < 1e-6);
      assert.equal(report.constraintStatus[0]?.status, "satisfied");
    },
  },
  {
    name: "sketch pointOnLine constraint: normalization solves and strips pointOnLine constraints",
    fn: async () => {
      const part = dsl.part("sketch-point-line-normalize", [
        dsl.sketch2d("sketch-point-line", [], {
          entities: [
            dsl.sketchLine("line-1", [0, 0], [10, 0]),
            dsl.sketchPoint("point-1", [4, 7]),
          ],
          constraints: [
            dsl.sketchConstraintPointOnLine(
              "c-point-line",
              dsl.sketchPointRef("point-1"),
              "line-1"
            ),
          ],
        }),
      ]);

      const normalized = normalizePart(part);
      const sketch = normalized.features[0] as Sketch2D;
      assert.equal("constraints" in sketch, false);

      const point = (sketch.entities ?? []).find((entity) => entity.id === "point-1") as SketchPoint;
      assert.ok(point, "missing normalized point-1");
      assert.deepEqual(point.point, [4, 0]);
    },
  },
  {
    name: "sketch pointOnLine constraint: rejects non-line references",
    fn: async () => {
      const part = dsl.part("sketch-point-line-invalid", [
        dsl.sketch2d("sketch-point-line", [], {
          entities: [
            dsl.sketchPoint("point-a", [0, 0]),
            dsl.sketchPoint("point-b", [1, 1]),
          ],
          constraints: [
            dsl.sketchConstraintPointOnLine(
              "c-point-line",
              dsl.sketchPointRef("point-a"),
              "point-b"
            ),
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
