import assert from "node:assert/strict";
import * as rootApi from "../index.js";
import { runTests } from "./occt_test_utils.js";

const coreModuleId = "@trueform/core";
const coreApi = (await import(coreModuleId)) as Record<string, unknown>;

const tests = [
  {
    name: "workspace core: @trueform/core exposes stable core contracts",
    fn: async () => {
      assert.equal(typeof coreApi.buildPart, "function");
      assert.equal(typeof coreApi.compilePart, "function");
      assert.equal(typeof coreApi.compileDocument, "function");
      assert.equal(typeof coreApi.dsl, "object");

      assert.equal(typeof coreApi.OcctBackend, "undefined");
      assert.equal(typeof coreApi.buildAssembly, "undefined");
      assert.equal(typeof coreApi.exportGlb, "undefined");
    },
  },
  {
    name: "workspace core: root facade remains source-compatible",
    fn: async () => {
      assert.equal(rootApi.buildPart, coreApi.buildPart);
      assert.equal(rootApi.compilePart, coreApi.compilePart);
      assert.equal(rootApi.compileDocument, coreApi.compileDocument);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
