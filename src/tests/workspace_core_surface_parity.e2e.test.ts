import assert from "node:assert/strict";
import * as rootCore from "../core.js";
import { runTests } from "./occt_test_utils.js";

const coreModuleId = "@trueform/core";
const coreApi = (await import(coreModuleId)) as Record<string, unknown>;

const REQUIRED_CORE_EXPORTS = [
  "IR_SCHEMA",
  "dsl",
  "compilePart",
  "compileDocument",
  "emitIrPart",
  "emitIrDocument",
  "buildPart",
  "buildPartAsync",
  "evaluatePartAssertions",
  "evaluatePartDimensions",
  "buildPmiPayload",
  "buildPmiJson",
];

const FORBIDDEN_CORE_EXPORTS = [
  "OcctBackend",
  "buildAssembly",
  "exportGlb",
  "NativeOcctBackend",
];

const tests = [
  {
    name: "workspace core parity: required exports exist in root and package entrypoint",
    fn: async () => {
      for (const key of REQUIRED_CORE_EXPORTS) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(coreApi, key),
          true,
          `@trueform/core missing export ${key}`
        );
        assert.equal(
          Object.prototype.hasOwnProperty.call(rootCore, key),
          true,
          `root core missing export ${key}`
        );
      }
    },
  },
  {
    name: "workspace core parity: root and package exports map to same implementation",
    fn: async () => {
      for (const key of REQUIRED_CORE_EXPORTS) {
        assert.equal(
          coreApi[key],
          (rootCore as Record<string, unknown>)[key],
          `mismatched export identity for ${key}`
        );
      }
    },
  },
  {
    name: "workspace core parity: backend/assembly/export surfaces stay out of core package",
    fn: async () => {
      for (const key of FORBIDDEN_CORE_EXPORTS) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(coreApi, key),
          false,
          `@trueform/core should not export ${key}`
        );
      }
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
