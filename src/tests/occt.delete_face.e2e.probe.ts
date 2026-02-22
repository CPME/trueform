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
    name: "occt parity probe: delete face removes selected planar face",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("delete-face-probe-open", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(20, 12) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
          "sketch-base",
        ]),
        dsl.deleteFace(
          "delete-top",
          dsl.selectorNamed("body:main"),
          dsl.selectorFace([dsl.predCreatedBy("base-extrude"), dsl.predPlanar()], [
            dsl.rankMaxZ(),
          ]),
          "surface:opened",
          ["base-extrude"],
          { heal: false }
        ),
      ]);

      const result = buildPart(part, backend);
      const source = result.final.outputs.get("body:main");
      const opened = result.final.outputs.get("surface:opened");
      assert.ok(source, "missing source body");
      assert.ok(opened, "missing delete-face result");

      const sourceShape = source.meta["shape"] as any;
      const openedShape = opened.meta["shape"] as any;
      assertValidShape(occt, sourceShape, "delete face source");
      assertValidShape(occt, openedShape, "delete face result");

      const sourceFaces = countFaces(occt, sourceShape);
      const openedFaces = countFaces(occt, openedShape);
      assert.ok(openedFaces < sourceFaces, `expected fewer faces (${openedFaces} < ${sourceFaces})`);
      assert.equal(countSolids(occt, openedShape), 0, "expected opened shell-like result");
    },
  },
  {
    name: "occt parity probe: delete face heal path produces valid output",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("delete-face-probe-heal", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(20, 12) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
          "sketch-base",
        ]),
        dsl.deleteFace(
          "delete-top",
          dsl.selectorNamed("body:main"),
          dsl.selectorFace([dsl.predCreatedBy("base-extrude"), dsl.predPlanar()], [
            dsl.rankMaxZ(),
          ]),
          "body:healed",
          ["base-extrude"],
          { heal: true }
        ),
      ]);

      const result = buildPart(part, backend);
      const healed = result.final.outputs.get("body:healed");
      assert.ok(healed, "missing healed delete-face result");
      const healedShape = healed.meta["shape"] as any;
      assertValidShape(occt, healedShape, "delete face heal result");
      assert.ok(
        countFaces(occt, healedShape) >= 1,
        "expected delete-face heal result to contain faces"
      );
    },
  },
  {
    name: "occt parity probe: replace face can replace with matched planar tool",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("replace-face-probe", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(20, 12) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
          "sketch-base",
        ]),
        dsl.plane("replace-tool", 20, 12, "surface:tool", {
          origin: [0, 0, 8],
          deps: ["base-extrude"],
        }),
        dsl.replaceFace(
          "replace-top",
          dsl.selectorNamed("body:main"),
          dsl.selectorFace([dsl.predCreatedBy("base-extrude"), dsl.predPlanar()], [
            dsl.rankMaxZ(),
          ]),
          dsl.selectorNamed("surface:tool"),
          "body:replaced",
          ["base-extrude", "replace-tool"],
          { heal: true }
        ),
      ]);

      const result = buildPart(part, backend);
      const replaced = result.final.outputs.get("body:replaced");
      assert.ok(replaced, "missing replace-face result");
      const replacedShape = replaced.meta["shape"] as any;
      assertValidShape(occt, replacedShape, "replace face result");
      assert.ok(countSolids(occt, replacedShape) >= 1, "expected replace-face solid result");
      assert.ok(countFaces(occt, replacedShape) >= 1, "expected replace-face result faces");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
