import assert from "node:assert/strict";
import * as api from "../index.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "exports: public surface includes DSL + compile/build + exports",
    fn: async () => {
      assert.equal(typeof api.buildPart, "function");
      assert.equal(typeof api.compilePart, "function");
      assert.equal(typeof api.compileDocument, "function");
      assert.equal(typeof (api as Record<string, unknown>).exportGlb, "function");
      assert.equal(typeof (api as Record<string, unknown>).export3mf, "function");
      assert.equal(
        typeof (api as Record<string, unknown>).exportStepAp242WithPmi,
        "function"
      );
      assert.equal(typeof (api as Record<string, unknown>).buildSketchSvg, "function");
      assert.equal(typeof (api as Record<string, unknown>).buildSketchDxf, "function");
      assert.equal(typeof api.dsl, "object");
      assert.equal((api as Record<string, unknown>).OcctBackend, undefined);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
