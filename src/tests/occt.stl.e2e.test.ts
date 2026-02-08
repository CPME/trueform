import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt stl: exports ASCII STL bytes with header",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("stl-plate", [
        dsl.extrude("base", dsl.profileRect(40, 20), 8, "body:main"),
      ]);
      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const stl = backend.exportStl(body, { format: "ascii" });
      assert.ok(stl.byteLength > 0, "STL output should be non-empty");

      const head = new TextDecoder().decode(stl.slice(0, 64)).toLowerCase();
      assert.ok(head.includes("solid"), "STL header should include 'solid'");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
