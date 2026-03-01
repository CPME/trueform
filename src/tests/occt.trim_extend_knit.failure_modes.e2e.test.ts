import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt surfacing failure: trim surface inside/outside rejects non-solid tools",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("trim-face-tool-failure", [
        dsl.plane("sheet", 20, 20, "surface:sheet"),
        dsl.plane("tool", 8, 8, "surface:tool", {
          origin: [0, 0, 0],
        }),
        dsl.trimSurface(
          "trim-1",
          dsl.selectorNamed("surface:sheet"),
          [dsl.selectorNamed("surface:tool")],
          "surface:trim",
          undefined,
          { keep: "outside" }
        ),
      ]);

      assert.throws(
        () => buildPart(part, backend),
        /requires solid tools/i
      );
    },
  },
  {
    name: "occt surfacing failure: extend surface rejects solid sources",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("extend-solid-source-failure", [
        dsl.extrude("base", dsl.profileRect(20, 12), 8, "body:main"),
        dsl.extendSurface(
          "extend-1",
          dsl.selectorNamed("body:main"),
          dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMaxZ()]),
          2,
          "surface:extended"
        ),
      ]);

      assert.throws(
        () => buildPart(part, backend),
        /source must resolve to face\/surface/i
      );
    },
  },
  {
    name: "occt surfacing failure: knit makeSolid errors when surfaces are not watertight",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("knit-open-solid-failure", [
        dsl.extrude("base", dsl.profileRect(20, 12), 8, "body:main"),
        dsl.knit(
          "knit-1",
          [
            dsl.selectorFace([dsl.predCreatedBy("base"), dsl.predPlanar()], [dsl.rankMaxZ()]),
            dsl.selectorFace([dsl.predCreatedBy("base"), dsl.predNormal("+X")]),
          ],
          "body:knit",
          undefined,
          { makeSolid: true }
        ),
      ]);

      assert.throws(
        () => buildPart(part, backend),
        /knit_non_watertight/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
