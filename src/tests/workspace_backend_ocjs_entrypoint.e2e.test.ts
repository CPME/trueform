import assert from "node:assert/strict";
import * as rootBackendsModule from "../backends.js";
import { runTests } from "./occt_test_utils.js";

const backendModuleId = "@trueform/backend-ocjs";
const workspaceBackend = (await import(backendModuleId)) as Record<string, unknown>;

const tests = [
  {
    name: "workspace backend-ocjs: exposes stable OCCT.js backend contracts",
    fn: async () => {
      assert.equal(typeof workspaceBackend.OcctBackend, "function");
    },
  },
  {
    name: "workspace backend-ocjs: package entrypoint stays source-compatible with root backend surface",
    fn: async () => {
      assert.equal(
        workspaceBackend.OcctBackend,
        (rootBackendsModule as Record<string, unknown>).OcctBackend
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
