import assert from "node:assert/strict";
import * as rootApiModule from "../api.js";
import { runTests } from "./occt_test_utils.js";

const apiModuleId = "@trueform/api";
const workspaceApi = (await import(apiModuleId)) as Record<string, unknown>;

const tests = [
  {
    name: "workspace api: @trueform/api exposes stable runtime contracts",
    fn: async () => {
      assert.equal(typeof workspaceApi.TF_API_VERSION, "string");
      assert.equal(typeof workspaceApi.TF_API_ENDPOINTS, "object");
      assert.equal(typeof workspaceApi.TF_RUNTIME_OPTIONAL_FEATURES, "object");
      assert.equal(typeof workspaceApi.resolveRuntimeFeatureStages, "function");
    },
  },
  {
    name: "workspace api: package entrypoint stays source-compatible with root api surface",
    fn: async () => {
      assert.equal(workspaceApi.TF_API_VERSION, (rootApiModule as Record<string, unknown>).TF_API_VERSION);
      assert.equal(workspaceApi.TF_API_ENDPOINTS, (rootApiModule as Record<string, unknown>).TF_API_ENDPOINTS);
      assert.equal(
        workspaceApi.resolveRuntimeFeatureStages,
        (rootApiModule as Record<string, unknown>).resolveRuntimeFeatureStages
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
