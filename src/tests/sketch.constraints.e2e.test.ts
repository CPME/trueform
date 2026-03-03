import assert from "node:assert/strict";
import { solveSketchConstraintsDetailed } from "../core.js";
import { dsl, Sketch2D, SketchLine, SketchPoint } from "../dsl.js";
import { normalizePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch constraints: solve fixed-point line constraints during normalization",
    fn: async () => {
      const part = dsl.part("sketch-constraints", [
        dsl.sketch2d("sketch-constrained", [], {
          entities: [
            dsl.sketchLine("line-1", [0, 0], [4, 3]),
            dsl.sketchLine("line-2", [20, 20], [20, 27]),
            dsl.sketchPoint("point-1", [9, 9]),
          ],
          constraints: [
            dsl.sketchConstraintFixPoint("c-fix-origin", dsl.sketchPointRef("line-1", "start"), {
              x: 0,
              y: 0,
            }),
            dsl.sketchConstraintHorizontal("c-horizontal", "line-1"),
            dsl.sketchConstraintDistance(
              "c-width",
              dsl.sketchPointRef("line-1", "start"),
              dsl.sketchPointRef("line-1", "end"),
              10
            ),
            dsl.sketchConstraintCoincident(
              "c-join",
              dsl.sketchPointRef("line-1", "end"),
              dsl.sketchPointRef("line-2", "start")
            ),
            dsl.sketchConstraintVertical("c-vertical", "line-2"),
            dsl.sketchConstraintDistance(
              "c-height",
              dsl.sketchPointRef("line-2", "start"),
              dsl.sketchPointRef("line-2", "end"),
              5
            ),
            dsl.sketchConstraintFixPoint("c-pin-point", dsl.sketchPointRef("point-1"), {
              x: 2,
              y: 5,
            }),
          ],
        }),
      ]);

      const normalized = normalizePart(part);
      const sketch = normalized.features[0] as Sketch2D;
      const byId = new Map((sketch.entities ?? []).map((entity) => [entity.id, entity]));

      assert.equal("constraints" in sketch, false);

      const line1 = byId.get("line-1") as SketchLine;
      assert.deepEqual(line1.start, [0, 0]);
      assert.deepEqual(line1.end, [10, 0]);

      const line2 = byId.get("line-2") as SketchLine;
      assert.deepEqual(line2.start, [10, 0]);
      assert.deepEqual(line2.end, [10, 5]);

      const point = byId.get("point-1") as SketchPoint;
      assert.deepEqual(point.point, [2, 5]);
    },
  },
  {
    name: "sketch constraints: solve parallel/perpendicular/equalLength and report dof",
    fn: async () => {
      const entities = [
        dsl.sketchLine("line-ref", [0, 0], [6, 0]),
        dsl.sketchLine("line-parallel", [20, 2], [23, 6]),
        dsl.sketchLine("line-perpendicular", [1, 1], [4, 5]),
        dsl.sketchLine("line-equal", [10, 0], [14, 0]),
      ];
      const report = solveSketchConstraintsDetailed("sketch-report", entities, [
        dsl.sketchConstraintParallel("c-parallel", "line-ref", "line-parallel"),
        dsl.sketchConstraintPerpendicular(
          "c-perpendicular",
          "line-ref",
          "line-perpendicular"
        ),
        dsl.sketchConstraintEqualLength("c-equal", "line-ref", "line-equal"),
      ]);

      const byId = new Map(report.entities.map((entity) => [entity.id, entity]));
      const lineParallel = byId.get("line-parallel") as SketchLine;
      assert.deepEqual(lineParallel.start, [20, 2]);
      assert.deepEqual(lineParallel.end, [25, 2]);

      const linePerpendicular = byId.get("line-perpendicular") as SketchLine;
      assert.deepEqual(linePerpendicular.start, [1, 1]);
      assert.deepEqual(linePerpendicular.end, [1, 6]);

      const lineEqual = byId.get("line-equal") as SketchLine;
      assert.deepEqual(lineEqual.start, [10, 0]);
      assert.deepEqual(lineEqual.end, [16, 0]);

      assert.equal(report.totalDegreesOfFreedom, 16);
      assert.equal(report.remainingDegreesOfFreedom, 13);
      assert.equal(report.status, "underconstrained");
      assert.deepEqual(
        report.entityStatus.map((entry) => ({
          entityId: entry.entityId,
          remainingDegreesOfFreedom: entry.remainingDegreesOfFreedom,
          status: entry.status,
        })),
        [
          {
            entityId: "line-ref",
            remainingDegreesOfFreedom: 4,
            status: "underconstrained",
          },
          {
            entityId: "line-parallel",
            remainingDegreesOfFreedom: 3,
            status: "underconstrained",
          },
          {
            entityId: "line-perpendicular",
            remainingDegreesOfFreedom: 3,
            status: "underconstrained",
          },
          {
            entityId: "line-equal",
            remainingDegreesOfFreedom: 3,
            status: "underconstrained",
          },
        ]
      );
    },
  },
  {
    name: "sketch constraints: reject constraints without sketch entities",
    fn: async () => {
      const part = dsl.part("sketch-constraints-invalid", [
        dsl.sketch2d("sketch-constrained", [], {
          constraints: [
            dsl.sketchConstraintFixPoint("c-fix-origin", dsl.sketchPointRef("point-1"), {
              x: 0,
            }),
          ],
        }),
      ]);

      assert.throws(
        () => normalizePart(part),
        /defines constraints but has no entities/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
