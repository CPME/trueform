import assert from "node:assert/strict";
import { solveSketchConstraintsDetailed } from "../core.js";
import { dsl, Sketch2D, SketchArc, SketchCircle } from "../dsl.js";
import { normalizePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch concentric constraint: detailed solve aligns curve centers",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-concentric",
        [
          dsl.sketchCircle("circle-ref", [1, 2], 5),
          dsl.sketchArc("arc-target", [11, 8], [8, 11], [8, 8], "ccw"),
        ],
        [dsl.sketchConstraintConcentric("c-concentric", "circle-ref", "arc-target")]
      );

      const arc = report.entities.find((entity) => entity.id === "arc-target") as SketchArc;
      assert.ok(arc, "missing solved arc-target");
      assert.deepEqual(arc.center, [1, 2]);
      assert.equal(report.constraintStatus[0]?.status, "satisfied");
    },
  },
  {
    name: "sketch concentric constraint: normalization solves and strips concentric constraints",
    fn: async () => {
      const part = dsl.part("sketch-concentric-normalize", [
        dsl.sketch2d("sketch-concentric", [], {
          entities: [
            dsl.sketchCircle("circle-a", [0, 0], 2),
            dsl.sketchCircle("circle-b", [5, 5], 4),
          ],
          constraints: [dsl.sketchConstraintConcentric("c-concentric", "circle-a", "circle-b")],
        }),
      ]);

      const normalized = normalizePart(part);
      const sketch = normalized.features[0] as Sketch2D;
      assert.equal("constraints" in sketch, false);

      const circle = (sketch.entities ?? []).find((entity) => entity.id === "circle-b") as SketchCircle;
      assert.ok(circle, "missing normalized circle-b");
      assert.deepEqual(circle.center, [0, 0]);
    },
  },
  {
    name: "sketch concentric constraint: rejects non-curve references",
    fn: async () => {
      const part = dsl.part("sketch-concentric-invalid", [
        dsl.sketch2d("sketch-concentric", [], {
          entities: [
            dsl.sketchCircle("circle-a", [0, 0], 2),
            dsl.sketchPoint("point-1", [3, 4]),
          ],
          constraints: [dsl.sketchConstraintConcentric("c-concentric", "circle-a", "point-1")],
        }),
      ]);

      assert.throws(
        () => normalizePart(part),
        /must reference a sketch\.circle or sketch\.arc/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
