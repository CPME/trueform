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

function fakeTransport() {
  return {
    async execFeature() {
      return { result: { outputs: [], selections: [] } };
    },
    async mesh() {
      return { positions: [], indices: [] };
    },
    async exportStep() {
      return new Uint8Array();
    },
  };
}

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
      const rootExports = rootExperimentalModule as Record<string, unknown>;
      const rootBackend = new (rootExports.OcctNativeBackend as new (...args: any[]) => any)({
        transport: fakeTransport(),
      });
      const workspaceNative = new (workspaceBackend.OcctNativeBackend as new (...args: any[]) => any)({
        transport: fakeTransport(),
      });
      assert.deepEqual(
        await workspaceNative.capabilities(),
        await rootBackend.capabilities()
      );
      assert.equal(typeof workspaceBackend.HttpOcctTransport, "function");
      assert.equal(typeof rootExports.HttpOcctTransport, "function");
      assert.equal(typeof workspaceBackend.LocalOcctTransport, "function");
      assert.equal(typeof rootExports.LocalOcctTransport, "function");
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
