import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt failure modes: delete face fails when selector matches no faces",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("delete-face-failure-no-match", [
        dsl.extrude("base", dsl.profileRect(20, 12), 8, "body:main"),
        dsl.deleteFace(
          "delete-top",
          dsl.selectorNamed("body:main"),
          dsl.selectorFace(
            [
              dsl.predCreatedBy("base"),
              dsl.predPlanar(),
              dsl.predNormal("+X"),
              dsl.predNormal("+Y"),
            ],
            [dsl.rankMaxZ()]
          ),
          "surface:opened",
          ["base"],
          { heal: false }
        ),
      ]);
      assert.throws(
        () => buildPart(part, backend),
        /matched 0/i
      );
    },
  },
  {
    name: "occt failure modes: replace face fails when source faces are missing",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("replace-face-failure-no-target", [
        dsl.extrude("base", dsl.profileRect(20, 12), 8, "body:main"),
        dsl.plane("tool", 20, 12, "surface:tool", { origin: [0, 0, 8], deps: ["base"] }),
        dsl.replaceFace(
          "replace-top",
          dsl.selectorNamed("body:main"),
          dsl.selectorFace(
            [
              dsl.predCreatedBy("base"),
              dsl.predPlanar(),
              dsl.predNormal("+X"),
              dsl.predNormal("+Y"),
            ],
            [dsl.rankMaxZ()]
          ),
          dsl.selectorNamed("surface:tool"),
          "body:replaced",
          ["base", "tool"],
          { heal: true }
        ),
      ]);
      assert.throws(
        () => buildPart(part, backend),
        /matched 0/i
      );
    },
  },
  {
    name: "occt failure modes: replace face fails when tool selector is missing",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("replace-face-failure-no-tool", [
        dsl.extrude("base", dsl.profileRect(20, 12), 8, "body:main"),
        dsl.plane("tool", 20, 12, "surface:tool", { origin: [0, 0, 8], deps: ["base"] }),
        dsl.replaceFace(
          "replace-top",
          dsl.selectorNamed("body:main"),
          dsl.selectorFace([dsl.predCreatedBy("base"), dsl.predPlanar()], [dsl.rankMaxZ()]),
          dsl.selectorFace(
            [
              dsl.predCreatedBy("tool"),
              dsl.predPlanar(),
              dsl.predNormal("+X"),
              dsl.predNormal("+Y"),
            ],
            [dsl.rankMaxZ()]
          ),
          "body:replaced",
          ["base", "tool"],
          { heal: true }
        ),
      ]);
      assert.throws(
        () => buildPart(part, backend),
        /matched 0/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
