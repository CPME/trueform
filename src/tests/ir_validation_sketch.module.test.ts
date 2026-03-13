import assert from "node:assert/strict";
import { CompileError } from "../errors.js";
import {
  validateDepth,
  validatePatternRef,
  validateProfileRef,
  validateSketchConstraint,
  validateSketchEntity,
  validateSketchProfile,
  type SketchValidationDeps,
} from "../validation/ir_validation_sketch.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(): SketchValidationDeps {
  return {
    ensureArray: <T>(value: unknown, code: string, message: string) => {
      if (!Array.isArray(value)) throw new CompileError(code, message);
      return value as T[];
    },
    ensureNonEmptyString: (value: unknown, code: string, message: string) => {
      if (typeof value !== "string" || value.length === 0) throw new CompileError(code, message);
      return value;
    },
    ensureObject: (value: unknown, code: string, message: string) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new CompileError(code, message);
    },
    validateNonNegativeScalar: (value, label) => {
      if (typeof value !== "number" || value < 0) {
        throw new CompileError("validation_scalar_non_negative", `${label} must be >= 0`);
      }
    },
    validatePoint2: (value, label) => {
      if (!Array.isArray(value) || value.length !== 2) throw new CompileError("validation_point2", label);
    },
    validatePoint3: (value, code, message) => {
      if (!Array.isArray(value) || value.length !== 3) throw new CompileError(code, message);
    },
    validateScalar: (value, label) => {
      if (typeof value !== "number") throw new CompileError("validation_scalar", label);
    },
    validatePositiveScalar: (value, label) => {
      if (typeof value !== "number" || value <= 0) {
        throw new CompileError("validation_scalar_positive", `${label} must be > 0`);
      }
    },
    scalarLiteral: (value) => (typeof value === "number" ? value : null),
  };
}

const tests = [
  {
    name: "ir sketch validation module: rejects construction entities in sketch profiles",
    fn: async () => {
      assert.throws(
        () =>
          validateSketchProfile(
            makeDeps(),
            { name: "p", profile: { kind: "profile.sketch", loop: ["l1"] } } as any,
            new Map([["l1", { id: "l1", kind: "sketch.line", construction: true } as any]])
          ),
        (error: unknown) =>
          error instanceof CompileError && error.code === "validation_sketch_profile_construction"
      );
    },
  },
  {
    name: "ir sketch validation module: validates shape refs and constraints",
    fn: async () => {
      const deps = makeDeps();
      validateSketchEntity(deps, { id: "c1", kind: "sketch.circle", center: [0, 0], radius: 5 } as any);
      validateSketchConstraint(deps, {
        id: "a1",
        kind: "sketch.constraint.distance",
        a: { entity: "p1", handle: "point" },
        b: { entity: "p2", handle: "point" },
        distance: 10,
      } as any);
      validateDepth(deps, "throughAll");
      validatePatternRef(deps, { kind: "pattern.linear", ref: "pat1" } as any);
      validateProfileRef(deps, { kind: "profile.ref", name: "outer" } as any);
    },
  },
  {
    name: "ir sketch validation module: rejects bad handles and out-of-range angles",
    fn: async () => {
      const deps = makeDeps();
      assert.throws(
        () =>
          validateSketchConstraint(deps, {
            id: "c1",
            kind: "sketch.constraint.coincident",
            a: { entity: "p1", handle: "bad" },
            b: { entity: "p2", handle: "point" },
          } as any),
        (error: unknown) =>
          error instanceof CompileError &&
          error.code === "validation_sketch_constraint_ref_handle"
      );
      assert.throws(
        () =>
          validateSketchConstraint(deps, {
            id: "c2",
            kind: "sketch.constraint.angle",
            a: "l1",
            b: "l2",
            angle: 181,
          } as any),
        (error: unknown) =>
          error instanceof CompileError &&
          error.code === "validation_sketch_constraint_angle_range"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
