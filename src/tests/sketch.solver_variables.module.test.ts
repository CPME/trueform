import assert from "node:assert/strict";
import { CompileError } from "../errors.js";
import type { SketchConstraint, SketchEntity } from "../ir.js";
import {
  collectDrivenVariables,
  collectScalarVariables,
  normalizedPointRefHandle,
  resolvePointRef,
} from "../sketch/solver_variables.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch solver variables: driven variable collection targets only constrained handles",
    fn: async () => {
      const entities = [
        { kind: "sketch.line", id: "line-1", start: [0, 0], end: [4, 0] },
        { kind: "sketch.point", id: "point-1", point: [1, 2] },
      ] as SketchEntity[];
      const constraints = [
        {
          id: "c1",
          kind: "sketch.constraint.coincident",
          a: { entity: "line-1", handle: "start" },
          b: { entity: "point-1", handle: "point" },
        },
      ] as SketchConstraint[];
      const variables = collectDrivenVariables(entities, constraints, 1e-9);
      assert.deepEqual(
        variables.map((variable) => `${variable.entityId}#${variable.handle}:${variable.kind}`),
        ["point-1#point:x", "point-1#point:y"]
      );
    },
  },
  {
    name: "sketch solver variables: scalar variables clamp circle radius to epsilon",
    fn: async () => {
      const circle = {
        kind: "sketch.circle",
        id: "circle-1",
        center: [0, 0],
        radius: 5,
      } as Extract<SketchEntity, { kind: "sketch.circle" }>;
      const variables = collectScalarVariables([circle], 0.25);
      const radius = variables.find((variable) => variable.handle === "radius");
      assert.ok(radius);
      radius.write(-10);
      assert.equal(circle.radius, 0.25);
    },
  },
  {
    name: "sketch solver variables: point refs normalize and reject unsupported handles",
    fn: async () => {
      const rectangle = {
        kind: "sketch.rectangle",
        id: "rect-1",
        mode: "corner",
        corner: [1, 2],
        width: 4,
        height: 6,
      } as Extract<SketchEntity, { kind: "sketch.rectangle" }>;
      assert.equal(normalizedPointRefHandle(rectangle, undefined), "corner");

      assert.throws(
        () =>
          resolvePointRef("sk1", new Map([[rectangle.id, rectangle]]), {
            entity: "rect-1",
            handle: "center",
          }),
        (error: unknown) =>
          error instanceof CompileError && error.code === "sketch_constraint_kind_mismatch"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
