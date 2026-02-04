import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "dsl: JSON round-trip preserves structure",
    fn: async () => {
      const part = dsl.part(
        "plate",
        [
          dsl.sketch2d("sketch-base", [
            {
              name: "profile:base",
              profile: dsl.profileRect(100, 60),
            },
          ]),
          dsl.extrude(
            "base-extrude",
            dsl.profileRef("profile:base"),
            dsl.exprLiteral(6, "mm"),
            "body:main",
            ["sketch-base"]
          ),
        ],
        {
          params: [
            dsl.paramLength("thickness", dsl.exprLiteral(6, "mm")),
            dsl.paramCount("copies", dsl.exprLiteral(2)),
          ],
        }
      );

      const doc = dsl.document("doc-1", [part], dsl.context());
      const roundTrip = JSON.parse(JSON.stringify(doc));
      assert.deepEqual(roundTrip, doc);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
