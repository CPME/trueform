import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { MockBackend } from "../mock_backend.js";
import { buildPart } from "../executor.js";
import { evaluatePartAssertions } from "../assertions.js";
import { runTests } from "./occt_test_utils.js";

class AssertionBackend extends MockBackend {
  mesh() {
    return {
      positions: [],
      edgePositions: [0, 0, 0, 2, 0, 0],
    };
  }
}

const tests = [
  {
    name: "assertions: brepValid + minEdgeLength evaluate",
    fn: async () => {
      const backend = new AssertionBackend();
      const part = dsl.part("plate", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(10, 5) },
        ]),
        dsl.extrude(
          "base-extrude",
          dsl.profileRef("profile:base"),
          2,
          "body:main",
          ["sketch-base"]
        ),
      ], {
        assertions: [
          dsl.assertBrepValid("a1"),
          dsl.assertMinEdgeLength("a2", 1),
        ],
      });
      const result = buildPart(part, backend);
      const assertions = evaluatePartAssertions(part, result.final, backend);
      assert.equal(assertions.length, 2);
      const brep = assertions.find((entry) => entry.id === "a1");
      const minEdge = assertions.find((entry) => entry.id === "a2");
      assert.equal(brep?.ok, true);
      assert.equal(minEdge?.ok, true);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
