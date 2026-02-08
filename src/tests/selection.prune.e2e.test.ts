import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { MockBackend } from "../mock_backend.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "executor: replaces selections by ownerKey",
    fn: async () => {
      const backend = new MockBackend();
      const part = dsl.part("plate", [
        dsl.extrude("base", dsl.profileRect(2, 3), 5, "body:main"),
        dsl.hole(
          "hole-1",
          dsl.selectorFace([dsl.predNormal("+Z"), dsl.predCreatedBy("base")]),
          "+Z",
          1,
          2
        ),
      ]);
      const result = buildPart(part, backend);
      const createdBy = new Set(
        result.final.selections.map((sel) => String(sel.meta["createdBy"]))
      );
      assert.equal(createdBy.size, 1);
      assert.ok(createdBy.has("hole-1"));
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
