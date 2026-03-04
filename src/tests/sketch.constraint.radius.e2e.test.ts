import assert from "node:assert/strict";
import { solveSketchConstraintsDetailed } from "../core.js";
import { dsl, Sketch2D, SketchArc, SketchCircle } from "../dsl.js";
import { normalizePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch radius constraint: detailed solve drives circle and arc radii",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-radius",
        [
          dsl.sketchCircle("circle-1", [2, 2], 3),
          dsl.sketchArc("arc-1", [5, 0], [0, 5], [0, 0], "ccw"),
        ],
        [
          dsl.sketchConstraintRadius("c-circle", "circle-1", 6),
          dsl.sketchConstraintRadius("c-arc", "arc-1", 10),
        ]
      );

      const circle = report.entities.find((entity) => entity.id === "circle-1") as SketchCircle;
      assert.ok(circle, "missing solved circle-1");
      assert.equal(circle.radius, 6);

      const arc = report.entities.find((entity) => entity.id === "arc-1") as SketchArc;
      assert.ok(arc, "missing solved arc-1");
      assert.deepEqual(arc.start, [10, 0]);
      assert.deepEqual(arc.end, [0, 10]);
      assert.deepEqual(
        report.constraintStatus.map((entry) => entry.status),
        ["satisfied", "satisfied"]
      );
    },
  },
  {
    name: "sketch radius constraint: normalization solves and strips radius constraints",
    fn: async () => {
      const part = dsl.part("sketch-radius-normalize", [
        dsl.sketch2d("sketch-radius", [], {
          entities: [
            dsl.sketchCircle("circle-1", [1, 2], 4),
            dsl.sketchArc("arc-1", [6, 0], [0, 6], [0, 0], "ccw"),
          ],
          constraints: [
            dsl.sketchConstraintRadius("c-circle", "circle-1", 7),
            dsl.sketchConstraintRadius("c-arc", "arc-1", 9),
          ],
        }),
      ]);

      const normalized = normalizePart(part);
      const sketch = normalized.features[0] as Sketch2D;
      assert.equal("constraints" in sketch, false);

      const circle = (sketch.entities ?? []).find((entity) => entity.id === "circle-1") as SketchCircle;
      assert.ok(circle, "missing normalized circle-1");
      assert.equal(circle.radius, 7);

      const arc = (sketch.entities ?? []).find((entity) => entity.id === "arc-1") as SketchArc;
      assert.ok(arc, "missing normalized arc-1");
      assert.deepEqual(arc.start, [9, 0]);
      assert.deepEqual(arc.end, [0, 9]);
    },
  },
  {
    name: "sketch radius constraint: rejects non-positive literal radii",
    fn: async () => {
      const part = dsl.part("sketch-radius-invalid", [
        dsl.sketch2d("sketch-radius", [], {
          entities: [dsl.sketchCircle("circle-1", [1, 2], 4)],
          constraints: [dsl.sketchConstraintRadius("c-circle", "circle-1", 0)],
        }),
      ]);

      assert.throws(
        () => normalizePart(part),
        /must be > 0/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
