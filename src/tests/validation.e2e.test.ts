import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { compileDocument, normalizePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "validation: invalid axis throws",
    fn: async () => {
      const badHole = {
        ...dsl.hole(
          "hole-1",
          dsl.selectorFace([dsl.predPlanar()]),
          "+Z",
          5,
          "throughAll"
        ),
        axis: "UP" as unknown as "+Z",
      };
      const part = dsl.part("plate", [badHole]);
      assert.throws(() => normalizePart(part), /axis/i);
    },
  },
  {
    name: "validation: empty feature id throws",
    fn: async () => {
      const badExtrude = {
        ...dsl.extrude("base", dsl.profileRect(2, 3), 5),
        id: "",
      };
      const part = dsl.part("plate", [badExtrude]);
      assert.throws(() => normalizePart(part), /Feature id/);
    },
  },
  {
    name: "validation: assembly instance missing part throws",
    fn: async () => {
      const part = dsl.part("part-a", []);
      const instance = dsl.assemblyInstance("inst-1", "missing-part");
      const assembly = dsl.assembly("asm-1", [instance]);
      const doc = dsl.document("doc-1", [part], dsl.context(), [assembly]);
      assert.throws(() => compileDocument(doc), /missing part/);
    },
  },
  {
    name: "validation: can be disabled",
    fn: async () => {
      const badHole = {
        ...dsl.hole(
          "hole-1",
          dsl.selectorFace([dsl.predPlanar()]),
          "+Z",
          5,
          "throughAll"
        ),
        axis: "UP" as unknown as "+Z",
      };
      const part = dsl.part("plate", [badHole]);
      assert.doesNotThrow(() => normalizePart(part, undefined, { validate: "none" }));
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
