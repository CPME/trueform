import assert from "node:assert/strict";
import { CompileError } from "../errors.js";
import {
  validateConstraint,
  validateCosmeticThread,
  validateDatum,
  type FtiValidationDeps,
} from "../validation/ir_validation_fti.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(): FtiValidationDeps {
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
    validateScalar: (value, label) => {
      if (typeof value !== "number") throw new CompileError("validation_scalar", label);
    },
    validateSelector: (selector) => {
      if (!selector || typeof selector !== "object") throw new CompileError("validation_selector", "selector");
    },
    validateThreadHandedness: (value) => {
      if (value !== "right" && value !== "left") {
        throw new CompileError("validation_thread_handedness", "handedness");
      }
    },
    scalarLiteral: (value) => (typeof value === "number" ? value : null),
  };
}

const tests = [
  {
    name: "ir fti validation module: validates datums and cosmetic threads",
    fn: async () => {
      const deps = makeDeps();
      validateDatum(deps, {
        id: "A",
        label: "A",
        target: { kind: "ref.surface", selector: { kind: "selector.named", name: "top" } },
      } as any);
      validateCosmeticThread(deps, {
        id: "t1",
        kind: "thread.cosmetic",
        target: { kind: "ref.edge", selector: { kind: "selector.named", name: "edge" } },
        designation: "M6x1",
      } as any);
    },
  },
  {
    name: "ir fti validation module: rejects invalid zones and missing datums",
    fn: async () => {
      const deps = makeDeps();
      assert.throws(
        () =>
          validateConstraint(
            deps,
            {
              id: "c1",
              kind: "constraint.position",
              target: { kind: "ref.edge", selector: { kind: "selector.named", name: "edge" } },
              tolerance: 0.1,
              datum: [{ kind: "datum.ref", datum: "A" }],
              zone: "polar",
            } as any,
            new Set(["A"])
          ),
        (error: unknown) =>
          error instanceof CompileError && error.code === "validation_constraint_zone"
      );
      assert.throws(
        () =>
          validateConstraint(
            deps,
            {
              id: "c2",
              kind: "constraint.parallelism",
              target: { kind: "ref.surface", selector: { kind: "selector.named", name: "face" } },
              tolerance: 0.1,
              datum: [{ kind: "datum.ref", datum: "A" }],
            } as any,
            new Set()
          ),
        (error: unknown) =>
          error instanceof CompileError &&
          error.code === "validation_constraint_datum_missing"
      );
    },
  },
  {
    name: "ir fti validation module: rejects cosmetic threads missing required dimensions",
    fn: async () => {
      assert.throws(
        () =>
          validateCosmeticThread(makeDeps(), {
            id: "t2",
            kind: "thread.cosmetic",
            target: { kind: "ref.edge", selector: { kind: "selector.named", name: "edge" } },
          } as any),
        (error: unknown) =>
          error instanceof CompileError && error.code === "validation_thread_required"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
