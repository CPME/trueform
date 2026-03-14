import assert from "node:assert/strict";
import * as rootExperimentalModule from "../experimental.js";
import { runTests } from "./occt_test_utils.js";

const backendModuleId = "@trueform/backend-native";
const workspaceBackend = (await import(backendModuleId)) as Record<string, unknown>;

const REQUIRED_EXPORTS = [
  "OcctNativeBackend",
  "HttpOcctTransport",
  "LocalOcctTransport",
];
const FORBIDDEN_EXPORTS = ["buildAssembly", "InMemoryJobQueue", "TfServiceClient"];

const tests = [
  {
    name: "workspace backend-native parity: required exports exist in root and package entrypoint",
    fn: async () => {
      for (const key of REQUIRED_EXPORTS) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(workspaceBackend, key),
          true,
          `@trueform/backend-native missing export ${key}`
        );
        assert.equal(
          Object.prototype.hasOwnProperty.call(rootExperimentalModule, key),
          true,
          `root experimental missing export ${key}`
        );
      }
    },
  },
  {
    name: "workspace backend-native parity: root and package exports map to same implementation",
    fn: async () => {
      for (const key of REQUIRED_EXPORTS) {
        assert.equal(
          workspaceBackend[key],
          (rootExperimentalModule as Record<string, unknown>)[key],
          `mismatched backend-native export identity for ${key}`
        );
      }
    },
  },
  {
    name: "workspace backend-native parity: package stays focused on native backend surface",
    fn: async () => {
      for (const key of FORBIDDEN_EXPORTS) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(workspaceBackend, key),
          false,
          `@trueform/backend-native should not export ${key}`
        );
      }
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
