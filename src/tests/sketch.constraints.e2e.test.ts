import assert from "node:assert/strict";
import { solveSketchConstraints, solveSketchConstraintsDetailed } from "../core.js";
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
        report.componentStatus.map((entry) => ({
          componentId: entry.componentId,
          grounded: entry.grounded,
          status: entry.status,
        })),
        [{ componentId: "component.1", grounded: false, status: "underconstrained" }]
      );
      assert.deepEqual(
        report.constraintStatus.map((entry) => ({
          constraintId: entry.constraintId,
          status: entry.status,
        })),
        [
          { constraintId: "c-parallel", status: "satisfied" },
          { constraintId: "c-perpendicular", status: "satisfied" },
          { constraintId: "c-equal", status: "satisfied" },
        ]
      );
      assert.deepEqual(
        report.entityStatus.map((entry) => ({
          entityId: entry.entityId,
          componentId: entry.componentId,
          grounded: entry.grounded,
          componentStatus: entry.componentStatus,
          remainingDegreesOfFreedom: entry.remainingDegreesOfFreedom,
          status: entry.status,
        })),
        [
          {
            entityId: "line-ref",
            componentId: "component.1",
            grounded: false,
            componentStatus: "underconstrained",
            remainingDegreesOfFreedom: 2,
            status: "underconstrained",
          },
          {
            entityId: "line-parallel",
            componentId: "component.1",
            grounded: false,
            componentStatus: "underconstrained",
            remainingDegreesOfFreedom: 3,
            status: "underconstrained",
          },
          {
            entityId: "line-perpendicular",
            componentId: "component.1",
            grounded: false,
            componentStatus: "underconstrained",
            remainingDegreesOfFreedom: 3,
            status: "underconstrained",
          },
          {
            entityId: "line-equal",
            componentId: "component.1",
            grounded: false,
            componentStatus: "underconstrained",
            remainingDegreesOfFreedom: 3,
            status: "underconstrained",
          },
        ]
      );
    },
  },
  {
    name: "sketch constraints: detailed solve does not mutate caller-owned entities",
    fn: async () => {
      const entities = [
        dsl.sketchLine("line-ref", [0, 0], [6, 0]),
        dsl.sketchLine("line-target", [20, 2], [23, 6]),
      ];

      const report = solveSketchConstraintsDetailed("sketch-immutable", entities, [
        dsl.sketchConstraintParallel("c-parallel", "line-ref", "line-target"),
      ]);

      const originalTarget = entities[1] as SketchLine;
      assert.deepEqual(originalTarget.start, [20, 2]);
      assert.deepEqual(originalTarget.end, [23, 6]);

      const solvedTarget = report.entities.find((entity) => entity.id === "line-target") as SketchLine;
      assert.ok(solvedTarget, "missing solved target line");
      assert.deepEqual(solvedTarget.start, [20, 2]);
      assert.deepEqual(solvedTarget.end, [25, 2]);
      assert.notEqual(solvedTarget, originalTarget);
    },
  },
  {
    name: "sketch constraints: classify overconstrained solved sketches",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-overconstrained",
        [dsl.sketchLine("line-1", [0, 0], [10, 0])],
        [
          dsl.sketchConstraintFixPoint("c-fix-start", dsl.sketchPointRef("line-1", "start"), {
            x: 0,
            y: 0,
          }),
          dsl.sketchConstraintHorizontal("c-horizontal", "line-1"),
          dsl.sketchConstraintFixPoint("c-fix-end", dsl.sketchPointRef("line-1", "end"), {
            x: 10,
            y: 0,
          }),
          dsl.sketchConstraintDistance(
            "c-distance",
            dsl.sketchPointRef("line-1", "start"),
            dsl.sketchPointRef("line-1", "end"),
            10
          ),
        ]
      );

      assert.equal(report.status, "overconstrained");
      assert.equal(report.remainingDegreesOfFreedom, 0);
      assert.deepEqual(
        report.componentStatus.map((entry) => ({
          grounded: entry.grounded,
          rigidBodyDegreesOfFreedom: entry.rigidBodyDegreesOfFreedom,
          status: entry.status,
        })),
        [{ grounded: true, rigidBodyDegreesOfFreedom: 0, status: "overconstrained" }]
      );
      assert.deepEqual(
        report.constraintStatus.map((entry) => entry.status),
        ["satisfied", "satisfied", "satisfied", "satisfied"]
      );
      assert.deepEqual(
        report.entityStatus.map((entry) => ({
          entityId: entry.entityId,
          status: entry.status,
        })),
        [{ entityId: "line-1", status: "overconstrained" }]
      );
    },
  },
  {
    name: "sketch constraints: classify ambiguous fully solved relative layouts",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-ambiguous",
        [
          dsl.sketchLine("line-1", [0, 0], [10, 0]),
          dsl.sketchLine("line-2", [10, 0], [10, 6]),
        ],
        [
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
            10
          ),
          dsl.sketchConstraintEqualLength("c-equal", "line-1", "line-2"),
          dsl.sketchConstraintPerpendicular("c-perp", "line-1", "line-2"),
        ]
      );

      assert.equal(report.status, "ambiguous");
      assert.equal(report.remainingDegreesOfFreedom, 2);
      assert.deepEqual(
        report.componentStatus.map((entry) => ({
          grounded: entry.grounded,
          rigidBodyDegreesOfFreedom: entry.rigidBodyDegreesOfFreedom,
          status: entry.status,
        })),
        [{ grounded: false, rigidBodyDegreesOfFreedom: 2, status: "component-constrained" }]
      );
      assert.deepEqual(
        report.entityStatus.map((entry) => ({
          entityId: entry.entityId,
          grounded: entry.grounded,
          componentStatus: entry.componentStatus,
          status: entry.status,
        })),
        [
          {
            entityId: "line-1",
            grounded: false,
            componentStatus: "component-constrained",
            status: "underconstrained",
          },
          {
            entityId: "line-2",
            grounded: false,
            componentStatus: "component-constrained",
            status: "underconstrained",
          },
        ]
      );
      assert.deepEqual(
        report.constraintStatus.map((entry) => entry.status),
        [
          "satisfied",
          "satisfied",
          "satisfied",
          "satisfied",
          "satisfied",
          "satisfied",
          "satisfied",
        ]
      );
    },
  },
  {
    name: "sketch constraints: report component grounding and per-entity grounded status",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-components",
        [
          dsl.sketchLine("line-grounded", [0, 0], [7, 2]),
          dsl.sketchLine("line-floating", [20, 5], [26, 8]),
        ],
        [
          dsl.sketchConstraintFixPoint(
            "c-grounded-start",
            dsl.sketchPointRef("line-grounded", "start"),
            { x: 0, y: 0 }
          ),
          dsl.sketchConstraintHorizontal("c-grounded-horizontal", "line-grounded"),
          dsl.sketchConstraintDistance(
            "c-grounded-width",
            dsl.sketchPointRef("line-grounded", "start"),
            dsl.sketchPointRef("line-grounded", "end"),
            10
          ),
          dsl.sketchConstraintHorizontal("c-floating-horizontal", "line-floating"),
          dsl.sketchConstraintDistance(
            "c-floating-width",
            dsl.sketchPointRef("line-floating", "start"),
            dsl.sketchPointRef("line-floating", "end"),
            8
          ),
        ]
      );

      assert.equal(report.status, "ambiguous");
      assert.equal(report.remainingDegreesOfFreedom, 2);
      assert.deepEqual(
        report.componentStatus.map((entry) => ({
          componentId: entry.componentId,
          entityIds: entry.entityIds,
          grounded: entry.grounded,
          rigidBodyDegreesOfFreedom: entry.rigidBodyDegreesOfFreedom,
          status: entry.status,
        })),
        [
          {
            componentId: "component.1",
            entityIds: ["line-grounded"],
            grounded: true,
            rigidBodyDegreesOfFreedom: 0,
            status: "fully-constrained",
          },
          {
            componentId: "component.2",
            entityIds: ["line-floating"],
            grounded: false,
            rigidBodyDegreesOfFreedom: 2,
            status: "component-constrained",
          },
        ]
      );
      assert.deepEqual(
        report.entityStatus.map((entry) => ({
          entityId: entry.entityId,
          componentId: entry.componentId,
          grounded: entry.grounded,
          componentStatus: entry.componentStatus,
          status: entry.status,
        })),
        [
          {
            entityId: "line-grounded",
            componentId: "component.1",
            grounded: true,
            componentStatus: "fully-constrained",
            status: "fully-constrained",
          },
          {
            entityId: "line-floating",
            componentId: "component.2",
            grounded: false,
            componentStatus: "component-constrained",
            status: "underconstrained",
          },
        ]
      );
    },
  },
  {
    name: "sketch constraints: report conflicts in detailed api and throw in strict api",
    fn: async () => {
      const entities = [dsl.sketchLine("line-1", [0, 0], [1, 1])];
      const constraints = [
        dsl.sketchConstraintFixPoint("c-fix-start", dsl.sketchPointRef("line-1", "start"), {
          x: 0,
          y: 0,
        }),
        dsl.sketchConstraintHorizontal("c-horizontal", "line-1"),
        dsl.sketchConstraintFixPoint("c-fix-end", dsl.sketchPointRef("line-1", "end"), {
          x: 1,
          y: 1,
        }),
      ];

      const report = solveSketchConstraintsDetailed("sketch-conflict", entities, constraints);
      assert.equal(report.status, "conflict");
      assert.equal(report.constraintStatus[1]?.constraintId, "c-horizontal");
      assert.equal(report.constraintStatus[1]?.status, "unsatisfied");
      assert.equal(report.constraintStatus[1]?.code, "sketch_constraint_unsatisfied");
      assert.ok(report.constraintStatus[1]?.message?.includes("c-horizontal"));
      assert.deepEqual(
        report.entityStatus.map((entry) => ({
          entityId: entry.entityId,
          componentStatus: entry.componentStatus,
          status: entry.status,
        })),
        [{ entityId: "line-1", componentStatus: "conflict", status: "conflict" }]
      );

      assert.throws(
        () => solveSketchConstraints("sketch-conflict", [dsl.sketchLine("line-1", [0, 0], [1, 1])], constraints),
        /c-horizontal/i
      );
    },
  },
  {
    name: "sketch constraints: conflicting component does not block independent component solve",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-component-isolation",
        [
          dsl.sketchLine("line-conflict", [0, 0], [1, 1]),
          dsl.sketchLine("line-stable", [20, 5], [25, 8]),
        ],
        [
          dsl.sketchConstraintFixPoint(
            "c-conflict-start",
            dsl.sketchPointRef("line-conflict", "start"),
            { x: 0, y: 0 }
          ),
          dsl.sketchConstraintHorizontal("c-conflict-horizontal", "line-conflict"),
          dsl.sketchConstraintFixPoint(
            "c-conflict-end",
            dsl.sketchPointRef("line-conflict", "end"),
            { x: 1, y: 1 }
          ),
          dsl.sketchConstraintFixPoint(
            "c-stable-start",
            dsl.sketchPointRef("line-stable", "start"),
            { x: 20, y: 5 }
          ),
          dsl.sketchConstraintHorizontal("c-stable-horizontal", "line-stable"),
          dsl.sketchConstraintDistance(
            "c-stable-length",
            dsl.sketchPointRef("line-stable", "start"),
            dsl.sketchPointRef("line-stable", "end"),
            4
          ),
        ]
      );

      const byId = new Map(report.entities.map((entity) => [entity.id, entity]));
      const stable = byId.get("line-stable") as SketchLine;
      assert.deepEqual(stable.start, [20, 5]);
      assert.deepEqual(stable.end, [24, 5]);
      assert.equal(report.status, "conflict");
      assert.deepEqual(
        report.constraintStatus.map((entry) => ({
          constraintId: entry.constraintId,
          status: entry.status,
        })),
        [
          { constraintId: "c-conflict-start", status: "satisfied" },
          { constraintId: "c-conflict-horizontal", status: "unsatisfied" },
          { constraintId: "c-conflict-end", status: "satisfied" },
          { constraintId: "c-stable-start", status: "satisfied" },
          { constraintId: "c-stable-horizontal", status: "satisfied" },
          { constraintId: "c-stable-length", status: "satisfied" },
        ]
      );
    },
  },
  {
    name: "sketch constraints: numerical solve converges across coupled mixed constraints",
    fn: async () => {
      const report = solveSketchConstraintsDetailed(
        "sketch-numeric-coupled",
        [
          dsl.sketchLine("line-1", [0, 0], [8, 3]),
          dsl.sketchLine("line-2", [10, 10], [14, 13]),
        ],
        [
          dsl.sketchConstraintFixPoint("c-fix", dsl.sketchPointRef("line-1", "start"), {
            x: 1,
            y: 2,
          }),
          dsl.sketchConstraintHorizontal("c-horizontal", "line-1"),
          dsl.sketchConstraintDistance(
            "c-width",
            dsl.sketchPointRef("line-1", "start"),
            dsl.sketchPointRef("line-1", "end"),
            5
          ),
          dsl.sketchConstraintCoincident(
            "c-join",
            dsl.sketchPointRef("line-1", "end"),
            dsl.sketchPointRef("line-2", "start")
          ),
          dsl.sketchConstraintAngle("c-angle", "line-1", "line-2", 90),
          dsl.sketchConstraintDistance(
            "c-height",
            dsl.sketchPointRef("line-2", "start"),
            dsl.sketchPointRef("line-2", "end"),
            4
          ),
        ]
      );

      const byId = new Map(report.entities.map((entity) => [entity.id, entity]));
      const line1 = byId.get("line-1") as SketchLine;
      const line2 = byId.get("line-2") as SketchLine;

      assert.deepEqual(line1.start, [1, 2]);
      assert.ok(Math.abs((line1.end[0] as number) - 6) < 1e-6);
      assert.ok(Math.abs((line1.end[1] as number) - 2) < 1e-6);
      assert.ok(Math.abs((line2.start[0] as number) - 6) < 1e-6);
      assert.ok(Math.abs((line2.start[1] as number) - 2) < 1e-6);
      assert.ok(Math.abs((line2.end[0] as number) - 6) < 1e-6);
      assert.ok(Math.abs((line2.end[1] as number) - 6) < 1e-6);
      assert.deepEqual(
        report.constraintStatus.map((entry) => entry.status),
        ["satisfied", "satisfied", "satisfied", "satisfied", "satisfied", "satisfied"]
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
