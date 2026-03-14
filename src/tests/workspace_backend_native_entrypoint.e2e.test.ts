import assert from "node:assert/strict";
import * as rootExperimentalModule from "../experimental.js";
import { runTests } from "./occt_test_utils.js";

const backendModuleId = "@trueform/backend-native";
const workspaceBackend = (await import(backendModuleId)) as Record<string, unknown>;

const tests = [
  {
    name: "workspace backend-native: exposes stable native backend contracts",
    fn: async () => {
      assert.equal(typeof workspaceBackend.OcctNativeBackend, "function");
      assert.equal(typeof workspaceBackend.HttpOcctTransport, "function");
      assert.equal(typeof workspaceBackend.LocalOcctTransport, "function");
    },
  },
  {
    name: "workspace backend-native: package entrypoint stays source-compatible with root experimental surface",
    fn: async () => {
      assert.equal(
        workspaceBackend.OcctNativeBackend,
        (rootExperimentalModule as Record<string, unknown>).OcctNativeBackend
      );
      assert.equal(
        workspaceBackend.HttpOcctTransport,
        (rootExperimentalModule as Record<string, unknown>).HttpOcctTransport
      );
      assert.equal(
        workspaceBackend.LocalOcctTransport,
        (rootExperimentalModule as Record<string, unknown>).LocalOcctTransport
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
