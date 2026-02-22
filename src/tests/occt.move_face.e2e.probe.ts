import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countFaces,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt parity probe: move face translates selected planar face",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("move-face-probe-open", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(20, 12) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
          "sketch-base",
        ]),
        dsl.moveFace(
          "move-top",
          dsl.selectorNamed("body:main"),
          dsl.selectorFace([dsl.predCreatedBy("base-extrude"), dsl.predPlanar()], [
            dsl.rankMaxZ(),
          ]),
          "surface:moved",
          ["base-extrude"],
          { translation: [0, 0, 1], heal: false }
        ),
      ]);

      const result = buildPart(part, backend);
      const moved = result.final.outputs.get("surface:moved");
      assert.ok(moved, "missing move-face result");
      const movedShape = moved.meta["shape"] as any;
      assertValidShape(occt, movedShape, "move face result");
      assert.ok(countFaces(occt, movedShape) >= 1, "expected moved-face output to contain faces");
      assert.equal(countSolids(occt, movedShape), 0, "expected open moved-face result");
    },
  },
  {
    name: "occt parity probe: move face heal path produces valid output",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("move-face-probe-heal", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(20, 12) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
          "sketch-base",
        ]),
        dsl.moveFace(
          "move-top",
          dsl.selectorNamed("body:main"),
          dsl.selectorFace([dsl.predCreatedBy("base-extrude"), dsl.predPlanar()], [
            dsl.rankMaxZ(),
          ]),
          "body:moved",
          ["base-extrude"],
          { translation: [0, 0, 1], heal: true }
        ),
      ]);

      const result = buildPart(part, backend);
      const moved = result.final.outputs.get("body:moved");
      assert.ok(moved, "missing healed move-face result");
      const movedShape = moved.meta["shape"] as any;
      assertValidShape(occt, movedShape, "move face heal result");
      assert.ok(countFaces(occt, movedShape) >= 1, "expected moved-face result faces");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
