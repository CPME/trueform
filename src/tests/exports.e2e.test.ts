import assert from "node:assert/strict";
import * as api from "../index.js";
import * as backendApi from "../backends.js";
import * as backendSpiApi from "../backend-spi.js";
import * as experimentalApi from "../experimental.js";
import * as exportApi from "../export/index.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "exports: root surface stays core-focused",
    fn: async () => {
      assert.equal(typeof api.buildPart, "function");
      assert.equal(typeof api.compilePart, "function");
      assert.equal(typeof api.compileDocument, "function");
      assert.equal(typeof api.dsl, "object");
      assert.equal(typeof (api as Record<string, unknown>).buildAssembly, "undefined");
      assert.equal(typeof (api as Record<string, unknown>).exportGlb, "undefined");
      assert.equal((api as Record<string, unknown>).OcctBackend, undefined);
    },
  },
  {
    name: "exports: backend/export/experimental sub-surfaces are explicit",
    fn: async () => {
      assert.equal(typeof backendApi.MockBackend, "function");
      assert.equal(typeof backendApi.OcctBackend, "function");

      assert.equal(typeof backendSpiApi.backendToAsync, "function");

      assert.equal(typeof experimentalApi.buildAssembly, "function");
      assert.equal(typeof experimentalApi.solveAssembly, "function");

      assert.equal(typeof exportApi.exportGlb, "function");
      assert.equal(typeof exportApi.export3mf, "function");
      assert.equal(typeof exportApi.exportStepAp242WithPmi, "function");
      assert.equal(typeof exportApi.buildSketchSvg, "function");
      assert.equal(typeof exportApi.buildSketchDxf, "function");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
