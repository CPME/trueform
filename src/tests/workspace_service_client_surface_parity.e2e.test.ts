import assert from "node:assert/strict";
import * as rootServiceClientModule from "../service_client.js";
import { runTests } from "./occt_test_utils.js";

const serviceClientModuleId = "@trueform/service-client";
const workspaceServiceClient = (await import(serviceClientModuleId)) as Record<string, unknown>;

const REQUIRED_EXPORTS = [
  "TF_SELECTOR_ERROR_CODES",
  "TfServiceClient",
  "getEdgeSelection",
  "getEdgeSelectionId",
  "getMeshSelection",
  "getMeshSelectionId",
  "getSemanticTopologyContractVersion",
  "indexBuildSelectionIds",
  "isSelectorError",
  "isSelectorErrorCode",
  "isSemanticTopologyEnabled",
  "selectionIdToNamedSelector",
];

const tests = [
  {
    name: "workspace service-client parity: required exports exist in root and package entrypoint",
    fn: async () => {
      for (const key of REQUIRED_EXPORTS) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(workspaceServiceClient, key),
          true,
          `@trueform/service-client missing export ${key}`
        );
        assert.equal(
          Object.prototype.hasOwnProperty.call(rootServiceClientModule, key),
          true,
          `root service-client missing export ${key}`
        );
      }
    },
  },
  {
    name: "workspace service-client parity: root and package exports map to same implementation",
    fn: async () => {
      for (const key of REQUIRED_EXPORTS) {
        assert.equal(
          workspaceServiceClient[key],
          (rootServiceClientModule as Record<string, unknown>)[key],
          `mismatched service-client export identity for ${key}`
        );
      }
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
