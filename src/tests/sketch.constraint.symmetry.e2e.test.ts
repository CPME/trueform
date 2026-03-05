import assert from "node:assert/strict";
import { solveSketchConstraintsDetailed } from "../core.js";
import { dsl, Sketch2D, SketchPoint } from "../dsl.js";
import { normalizePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch symmetry constraint: detailed solve mirrors target point across axis",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-symmetry",
        [
          dsl.sketchLine("axis-1", [0, 0], [10, 0]),
          dsl.sketchPoint("point-a", [2, 3]),
          dsl.sketchPoint("point-b", [5, 9]),
        ],
        [
          dsl.sketchConstraintSymmetry(
            "c-symmetry",
            dsl.sketchPointRef("point-a"),
            dsl.sketchPointRef("point-b"),
            "axis-1"
          ),
        ]
      );

      const point = report.entities.find((entity) => entity.id === "point-b") as SketchPoint;
      assert.ok(point, "missing solved point-b");
      assert.deepEqual(point.point, [2, -3]);
      assert.equal(report.constraintStatus[0]?.status, "satisfied");
    },
  },
  {
    name: "sketch symmetry constraint: normalization solves and strips symmetry constraints",
    fn: async () => {
      const part = dsl.part("sketch-symmetry-normalize", [
        dsl.sketch2d("sketch-symmetry", [], {
          entities: [
            dsl.sketchLine("axis-1", [0, 0], [0, 10]),
            dsl.sketchPoint("point-a", [3, 2]),
            dsl.sketchPoint("point-b", [0, 0]),
          ],
          constraints: [
            dsl.sketchConstraintSymmetry(
              "c-symmetry",
              dsl.sketchPointRef("point-a"),
              dsl.sketchPointRef("point-b"),
              "axis-1"
            ),
          ],
        }),
      ]);

      const normalized = normalizePart(part);
      const sketch = normalized.features[0] as Sketch2D;
      assert.equal("constraints" in sketch, false);

      const point = (sketch.entities ?? []).find((entity) => entity.id === "point-b") as SketchPoint;
      assert.ok(point, "missing normalized point-b");
      assert.deepEqual(point.point, [-3, 2]);
    },
  },
  {
    name: "sketch symmetry constraint: rejects non-line axis references",
    fn: async () => {
      const part = dsl.part("sketch-symmetry-invalid", [
        dsl.sketch2d("sketch-symmetry", [], {
          entities: [
            dsl.sketchPoint("point-a", [1, 1]),
            dsl.sketchPoint("point-b", [2, 2]),
            dsl.sketchPoint("point-axis", [0, 0]),
          ],
          constraints: [
            dsl.sketchConstraintSymmetry(
              "c-symmetry",
              dsl.sketchPointRef("point-a"),
              dsl.sketchPointRef("point-b"),
              "point-axis"
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
