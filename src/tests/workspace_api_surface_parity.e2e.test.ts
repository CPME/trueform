import assert from "node:assert/strict";
import * as rootApiModule from "../api.js";
import { runTests } from "./occt_test_utils.js";

const apiModuleId = "@trueform/api";
const workspaceApi = (await import(apiModuleId)) as Record<string, unknown>;

const REQUIRED_EXPORTS = [
  "TF_API_VERSION",
  "TF_API_ENDPOINTS",
  "TF_RUNTIME_OPTIONAL_FEATURES",
  "TF_RUNTIME_ERROR_CONTRACT",
  "TF_RUNTIME_SEMANTIC_TOPOLOGY",
  "TF_RUNTIME_FEATURE_STAGING",
  "resolveRuntimeFeatureStages",
];

const tests = [
  {
    name: "workspace api parity: required exports exist in root and package entrypoint",
    fn: async () => {
      for (const key of REQUIRED_EXPORTS) {
        assert.equal(Object.prototype.hasOwnProperty.call(workspaceApi, key), true, `@trueform/api missing export ${key}`);
        assert.equal(Object.prototype.hasOwnProperty.call(rootApiModule, key), true, `root api missing export ${key}`);
      }
    },
  },
  {
    name: "workspace api parity: root and package exports map to same implementation",
    fn: async () => {
      for (const key of REQUIRED_EXPORTS) {
        assert.equal(workspaceApi[key], (rootApiModule as Record<string, unknown>)[key], `mismatched api export identity for ${key}`);
      }
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
