import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt step: exports STEP bytes with header",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("step-plate", [
        dsl.extrude("base", dsl.profileRect(40, 20), 8, "body:main"),
      ]);
      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const step = backend.exportStep(body);
      assert.ok(step.byteLength > 0, "STEP output should be non-empty");

      const head = new TextDecoder().decode(step.slice(0, 64));
      assert.ok(
        head.includes("ISO-10303-21"),
        "STEP header should include ISO-10303-21"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
