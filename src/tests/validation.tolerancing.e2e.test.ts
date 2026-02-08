import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { compilePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "validation: tolerancing requires defined datums",
    fn: async () => {
      const face = dsl.selectorFace([dsl.predPlanar()]);
      const part = dsl.part("tolerancing-invalid", [], {
        constraints: [
          dsl.parallelismConstraint(
            "par-1",
            dsl.refSurface(face),
            0.1,
            [dsl.datumRef("datum-A")]
          ),
        ],
      });
      assert.throws(() => compilePart(part));
    },
  },
  {
    name: "validation: size constraint must declare tolerance or limits",
    fn: async () => {
      const face = dsl.selectorFace([dsl.predPlanar()]);
      const part = dsl.part("size-invalid", [], {
        constraints: [
          dsl.sizeConstraint("size-1", dsl.refSurface(face), {}),
        ],
      });
      assert.throws(() => compilePart(part));
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
