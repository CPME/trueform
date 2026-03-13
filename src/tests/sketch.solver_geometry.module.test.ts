import assert from "node:assert/strict";
import { CompileError } from "../errors.js";
import type { SketchEntity } from "../ir.js";
import {
  preferredCurveSeparation,
  projectCurveToCurveTangency,
  projectCurveToLineTangency,
  resolveRadiusTarget,
  tryResolveTangentCurve,
} from "../sketch/solver_geometry.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch solver geometry: tangent projection moves curve center onto line offset",
    fn: async () => {
      const circle = {
        kind: "sketch.circle",
        id: "circle-1",
        center: [2, 0.5],
        radius: 2,
      } as Extract<SketchEntity, { kind: "sketch.circle" }>;
      const entityMap = new Map([[circle.id, circle]]);
      const lineRef = {
        readStart: () => [0, 0] as [number, number],
        readEnd: () => [10, 0] as [number, number],
        writeStart: () => undefined,
        write: () => undefined,
        writeEnd: () => undefined,
      };
      const curve = tryResolveTangentCurve("sk1", entityMap, "circle-1", 1e-9);
      assert.ok(curve);
      const moved = projectCurveToLineTangency(lineRef, curve, 1e-9);
      assert.ok(moved > 1.4 && moved < 1.6);
      assert.deepEqual(circle.center, [2, 2]);
    },
  },
  {
    name: "sketch solver geometry: curve-to-curve tangency chooses nearest separation mode",
    fn: async () => {
      const circleA = {
        kind: "sketch.circle",
        id: "circle-a",
        center: [0, 0],
        radius: 5,
      } as Extract<SketchEntity, { kind: "sketch.circle" }>;
      const circleB = {
        kind: "sketch.circle",
        id: "circle-b",
        center: [3, 0],
        radius: 2,
      } as Extract<SketchEntity, { kind: "sketch.circle" }>;
      const entityMap = new Map([
        [circleA.id, circleA],
        [circleB.id, circleB],
      ]);
      const a = tryResolveTangentCurve("sk1", entityMap, "circle-a", 1e-9);
      const b = tryResolveTangentCurve("sk1", entityMap, "circle-b", 1e-9);
      assert.ok(a);
      assert.ok(b);
      projectCurveToCurveTangency(a, b, 1e-9);
      assert.deepEqual(circleB.center, [3, 0]);
      assert.equal(preferredCurveSeparation(3, 5, 2), 3);
    },
  },
  {
    name: "sketch solver geometry: radius target rejects degenerate arcs",
    fn: async () => {
      const arc = {
        kind: "sketch.arc",
        id: "arc-1",
        center: [0, 0],
        start: [0, 0],
        end: [1, 0],
      } as Extract<SketchEntity, { kind: "sketch.arc" }>;
      const target = resolveRadiusTarget("sk1", new Map([[arc.id, arc]]), "arc-1", 1e-9);
      assert.throws(
        () => target.residual(3),
        (error: unknown) =>
          error instanceof CompileError && error.code === "sketch_constraint_invalid_reference"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
