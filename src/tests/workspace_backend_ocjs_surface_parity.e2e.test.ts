import assert from "node:assert/strict";
import * as rootBackendsModule from "../backends.js";
import { runTests } from "./occt_test_utils.js";

const backendModuleId = "@trueform/backend-ocjs";
const workspaceBackend = (await import(backendModuleId)) as Record<string, unknown>;

const REQUIRED_EXPORTS = ["OcctBackend"];
const FORBIDDEN_EXPORTS = ["MockBackend", "OcctNativeBackend"];

const tests = [
  {
    name: "workspace backend-ocjs parity: required exports exist in root and package entrypoint",
    fn: async () => {
      for (const key of REQUIRED_EXPORTS) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(workspaceBackend, key),
          true,
          `@trueform/backend-ocjs missing export ${key}`
        );
        assert.equal(
          Object.prototype.hasOwnProperty.call(rootBackendsModule, key),
          true,
          `root backends missing export ${key}`
        );
      }
    },
  },
  {
    name: "workspace backend-ocjs parity: root and package exports map to same implementation",
    fn: async () => {
      for (const key of REQUIRED_EXPORTS) {
        assert.equal(
          workspaceBackend[key],
          (rootBackendsModule as Record<string, unknown>)[key],
          `mismatched backend-ocjs export identity for ${key}`
        );
      }
    },
  },
  {
    name: "workspace backend-ocjs parity: package stays focused on OCCT.js backend surface",
    fn: async () => {
      for (const key of FORBIDDEN_EXPORTS) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(workspaceBackend, key),
          false,
          `@trueform/backend-ocjs should not export ${key}`
        );
      }
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
