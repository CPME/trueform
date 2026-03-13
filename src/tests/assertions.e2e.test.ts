import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { MockBackend } from "../mock_backend.js";
import { buildPart } from "../executor.js";
import { evaluatePartAssertions } from "../assertions.js";
import type { Backend, KernelResult } from "../backend.js";
import { runTests } from "./occt_test_utils.js";

class AssertionBackend extends MockBackend {
  mesh() {
    return {
      positions: [],
      edgePositions: [0, 0, 0, 2, 0, 0],
    };
  }
}

class FailingMinEdgeBackend extends MockBackend {
  mesh() {
    return {
      positions: [],
      edgePositions: [0, 0, 0, 0.25, 0, 0],
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
  {
    name: "assertions: minEdgeLength reports failures with computed details",
    fn: async () => {
      const backend = new FailingMinEdgeBackend();
      const part = dsl.part("plate-short-edge", [
        dsl.extrude("base-extrude", dsl.profileRect(10, 5), 2, "body:main"),
      ], {
        assertions: [dsl.assertMinEdgeLength("a-short", 1)],
      });

      const result = buildPart(part, backend);
      const assertions = evaluatePartAssertions(part, result.final, backend);
      assert.equal(assertions.length, 1);
      assert.deepEqual(assertions[0], {
        id: "a-short",
        kind: "assert.minEdgeLength",
        status: "fail",
        ok: false,
        details: {
          minLength: 0.25,
          threshold: 1,
        },
      });
    },
  },
  {
    name: "assertions: unsupported backends surface actionable messages",
    fn: async () => {
      const part = dsl.part("plate-unsupported-assertions", [], {
        assertions: [dsl.assertBrepValid("a-brep"), dsl.assertMinEdgeLength("a-edge", 1)],
      });
      const result: KernelResult = {
        outputs: new Map([
          [
            "body:main",
            {
              id: "body:main",
              kind: "solid",
              meta: {},
            },
          ],
        ]),
        selections: [],
      };
      const backend: Backend = {
        execute: () => {
          throw new Error("execute should not be called while evaluating assertions");
        },
        mesh: () => ({ positions: [], edgePositions: [] }),
        exportStep: () => new Uint8Array(),
      };

      const assertions = evaluatePartAssertions(part, result, backend);
      assert.deepEqual(assertions, [
        {
          id: "a-brep",
          kind: "assert.brepValid",
          status: "unsupported",
          ok: false,
          message: "Backend does not expose checkValid",
        },
        {
          id: "a-edge",
          kind: "assert.minEdgeLength",
          status: "unsupported",
          ok: false,
          message: "Backend did not provide edge samples for minEdgeLength",
        },
      ]);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
