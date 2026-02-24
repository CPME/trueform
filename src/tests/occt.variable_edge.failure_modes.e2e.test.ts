import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt failure modes: variable fillet fails when edge selector matches no edges",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("variable-fillet-failure-no-edges", [
        dsl.extrude("base", dsl.profileCircle(12), 16, "body:main"),
        dsl.variableFillet(
          "fillet-var",
          dsl.selectorNamed("body:main"),
          [
            {
              edge: dsl.selectorEdge(
                [dsl.predCreatedBy("base"), dsl.predNormal("+X"), dsl.predNormal("+Y")],
                [dsl.rankMaxZ()]
              ),
              radius: 1.2,
            },
          ],
          "body:filleted",
          ["base"]
        ),
      ]);
      assert.throws(() => buildPart(part, backend), /metadata normal/i);
    },
  },
  {
    name: "occt failure modes: variable chamfer fails when edge selector matches no edges",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("variable-chamfer-failure-no-edges", [
        dsl.extrude("base", dsl.profileCircle(12), 16, "body:main"),
        dsl.variableChamfer(
          "chamfer-var",
          dsl.selectorNamed("body:main"),
          [
            {
              edge: dsl.selectorEdge(
                [dsl.predCreatedBy("base"), dsl.predNormal("+X"), dsl.predNormal("+Y")],
                [dsl.rankMaxZ()]
              ),
              distance: 1.2,
            },
          ],
          "body:chamfered",
          ["base"]
        ),
      ]);
      assert.throws(() => buildPart(part, backend), /metadata normal/i);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
