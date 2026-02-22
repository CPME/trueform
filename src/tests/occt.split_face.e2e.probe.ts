import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { assertValidShape, countFaces, getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt parity probe: split face against solid owner",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("split-face-probe", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(20, 12) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
          "sketch-base",
        ]),
        dsl.plane("split-plane", 24, 16, "surface:splitter", {
          origin: [0, 0, 4],
          deps: ["base-extrude"],
        }),
        dsl.splitFace(
          "split-face",
          dsl.selectorFace([dsl.predCreatedBy("base-extrude"), dsl.predPlanar()], [
            dsl.rankMaxArea(),
          ]),
          dsl.selectorNamed("surface:splitter"),
          "body:split",
          ["base-extrude", "split-plane"]
        ),
      ]);

      const result = buildPart(part, backend);
      const split = result.final.outputs.get("body:split");
      assert.ok(split, "missing split face output");
      const shape = split.meta["shape"] as any;
      assert.ok(shape, "missing split face shape");
      assertValidShape(occt, shape, "split face result");
      const faceCount = countFaces(occt, shape);
      assert.ok(faceCount >= 8, `expected split face to create >= 8 faces, got ${faceCount}`);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
