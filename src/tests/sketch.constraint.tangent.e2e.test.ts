import assert from "node:assert/strict";
import { solveSketchConstraintsDetailed } from "../core.js";
import { dsl, Sketch2D, SketchArc, SketchCircle } from "../dsl.js";
import { normalizePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch tangent constraint: detailed solve satisfies line-circle tangency with radius lock",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-tangent",
        [
          dsl.sketchLine("line-1", [0, 0], [10, 0]),
          dsl.sketchCircle("circle-1", [5, 7], 3),
        ],
        [
          dsl.sketchConstraintTangent("c-tangent", "line-1", "circle-1"),
          dsl.sketchConstraintRadius("c-radius", "circle-1", 3),
        ]
      );

      const circle = report.entities.find((entity) => entity.id === "circle-1") as SketchCircle;
      assert.ok(circle, "missing solved circle-1");
      assert.equal(circle.center[0], 5);
      assert.ok(Math.abs((circle.center[1] as number) - 3) < 1e-6);
      assert.equal(circle.radius, 3);
      assert.deepEqual(
        report.constraintStatus.map((entry) => entry.status),
        ["satisfied", "satisfied"]
      );
    },
  },
  {
    name: "sketch tangent constraint: normalization solves and strips tangent constraints",
    fn: async () => {
      const part = dsl.part("sketch-tangent-normalize", [
        dsl.sketch2d("sketch-tangent", [], {
          entities: [
            dsl.sketchLine("line-1", [0, 0], [10, 0]),
            dsl.sketchArc("arc-1", [11, 8], [8, 11], [8, 8], "ccw"),
          ],
          constraints: [
            dsl.sketchConstraintTangent("c-tangent", "line-1", "arc-1"),
            dsl.sketchConstraintRadius("c-radius", "arc-1", 3),
          ],
        }),
      ]);

      const normalized = normalizePart(part);
      const sketch = normalized.features[0] as Sketch2D;
      assert.equal("constraints" in sketch, false);

      const arc = (sketch.entities ?? []).find((entity) => entity.id === "arc-1") as SketchArc;
      assert.ok(arc, "missing normalized arc-1");
      assert.ok(Math.abs((arc.center[1] as number) - 3) < 1e-6);
      const startRadius = Math.hypot(
        (arc.start[0] as number) - (arc.center[0] as number),
        (arc.start[1] as number) - (arc.center[1] as number)
      );
      const endRadius = Math.hypot(
        (arc.end[0] as number) - (arc.center[0] as number),
        (arc.end[1] as number) - (arc.center[1] as number)
      );
      assert.ok(Math.abs(startRadius - 3) < 1e-6);
      assert.ok(Math.abs(endRadius - 3) < 1e-6);
    },
  },
  {
    name: "sketch tangent constraint: rejects unsupported entity kinds",
    fn: async () => {
      const part = dsl.part("sketch-tangent-invalid", [
        dsl.sketch2d("sketch-tangent", [], {
          entities: [
            dsl.sketchLine("line-1", [0, 0], [10, 0]),
            dsl.sketchPoint("point-1", [2, 3]),
          ],
          constraints: [dsl.sketchConstraintTangent("c-tangent", "line-1", "point-1")],
        }),
      ]);

      assert.throws(
        () => normalizePart(part),
        /requires line\/arc\/circle references/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
