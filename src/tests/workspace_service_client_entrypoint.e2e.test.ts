import assert from "node:assert/strict";
import * as rootServiceClientModule from "../service_client.js";
import { runTests } from "./occt_test_utils.js";

const serviceClientModuleId = "@trueform/service-client";
const workspaceServiceClient = (await import(serviceClientModuleId)) as Record<string, unknown>;

const tests = [
  {
    name: "workspace service-client: @trueform/service-client exposes stable client contracts",
    fn: async () => {
      assert.equal(typeof workspaceServiceClient.TfServiceClient, "function");
    },
  },
  {
    name: "workspace service-client: package entrypoint stays source-compatible with root client surface",
    fn: async () => {
      assert.equal(
        workspaceServiceClient.TfServiceClient,
        (rootServiceClientModule as Record<string, unknown>).TfServiceClient
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
