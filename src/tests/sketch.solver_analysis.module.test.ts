import assert from "node:assert/strict";
import { CompileError } from "../errors.js";
import type { SketchConstraint, SketchEntity } from "../ir.js";
import {
  buildConstraintComponents,
  buildConstraintStatus,
  ensureUniqueConstraintIds,
  type SolverAnalysisDeps,
} from "../sketch/solver_analysis.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(overrides: Partial<SolverAnalysisDeps> = {}): SolverAnalysisDeps {
  return {
    solveTolerance: 1e-6,
    collectScalarVariables: () => [],
    constraintResidualComponents: () => [0],
    estimateConstraintConsumption: () => ({ totalConsumed: 0, byEntity: new Map() }),
    estimateEntityDegreesOfFreedom: () => 2,
    estimateMatrixRank: () => 0,
    estimateRigidBodyModes: () => 0,
    listConstraintEntityIds: (constraint) => {
      switch (constraint.kind) {
        case "sketch.constraint.distance":
          return [constraint.a.entity, constraint.b.entity];
        case "sketch.constraint.radius":
          return [constraint.curve];
        default:
          return [];
      }
    },
    measureConstraintResidual: () => 0,
    ...overrides,
  };
}

const tests = [
  {
    name: "sketch solver analysis: duplicate ids are rejected",
    fn: async () => {
      assert.throws(
        () =>
          ensureUniqueConstraintIds("sk1", [
            { id: "c1", kind: "sketch.constraint.radius", curve: "a", radius: 1 } as any,
            { id: "c1", kind: "sketch.constraint.radius", curve: "b", radius: 2 } as any,
          ]),
        (error: unknown) =>
          error instanceof CompileError && error.code === "sketch_constraint_duplicate_id"
      );
    },
  },
  {
    name: "sketch solver analysis: connected entities are grouped into components",
    fn: async () => {
      const entities = [{ id: "a" }, { id: "b" }, { id: "c" }] as SketchEntity[];
      const constraints = [
        {
          id: "c1",
          kind: "sketch.constraint.distance",
          a: { entity: "a", handle: "point" },
          b: { entity: "b", handle: "point" },
          distance: 1,
        },
        { id: "c2", kind: "sketch.constraint.radius", curve: "c", radius: 1 },
      ] as SketchConstraint[];
      assert.deepEqual(buildConstraintComponents(makeDeps(), entities, constraints), [
        { componentId: "component.1", entityIds: ["a", "b"], constraintIds: ["c1"] },
        { componentId: "component.2", entityIds: ["c"], constraintIds: ["c2"] },
      ]);
    },
  },
  {
    name: "sketch solver analysis: compile errors become unsatisfied constraint diagnostics",
    fn: async () => {
      const status = buildConstraintStatus(
        makeDeps({
          measureConstraintResidual: () => {
            throw new CompileError("bad_ref", "bad ref");
          },
          listConstraintEntityIds: () => ["a"],
        }),
        "sk1",
        new Map(),
        { id: "c1", kind: "sketch.constraint.radius", curve: "a", radius: 1 } as any,
        "authored"
      );
      assert.equal(status.status, "unsatisfied");
      assert.equal(status.code, "bad_ref");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
