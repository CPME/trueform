import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertPositiveVolume,
  assertValidShape,
  countFaces,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

function makeSplitBodyPart(id: string, splitPlaneZ: number) {
  return dsl.part(id, [
    dsl.sketch2d("sketch-base", [
      { name: "profile:base", profile: dsl.profileRect(20, 12) },
    ]),
    dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
      "sketch-base",
    ]),
    dsl.plane("split-plane", 24, 16, "surface:splitter", {
      origin: [0, 0, splitPlaneZ],
      deps: ["base-extrude"],
    }),
    dsl.splitBody(
      "split-body",
      dsl.selectorNamed("body:main"),
      dsl.selectorNamed("surface:splitter"),
      "body:split",
      ["base-extrude", "split-plane"]
    ),
  ]);
}

function makeSplitFacePart(id: string, normal: "+X" | "+Y") {
  const datumId = normal === "+X" ? "datum-x" : "datum-y";
  return dsl.part(id, [
    dsl.datumPlane(datumId, normal),
    dsl.sketch2d("sketch-base", [
      { name: "profile:base", profile: dsl.profileRect(20, 12) },
    ]),
    dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
      "sketch-base",
    ]),
    dsl.plane("split-plane", 24, 16, "surface:splitter", {
      plane: dsl.planeDatum(datumId),
      origin: [0, 0, 4],
      deps: [datumId, "base-extrude"],
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
}

const tests = [
  {
    name: "occt split stability: body split stays valid across interior plane offsets",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const offsets = [2, 3, 4, 5, 6];
      for (const z of offsets) {
        const part = makeSplitBodyPart(`split-body-z-${z}`, z);
        const result = buildPart(part, backend);
        const split = result.final.outputs.get("body:split");
        assert.ok(split, `missing split output at z=${z}`);
        const shape = split.meta["shape"] as any;
        assertValidShape(occt, shape, `split body z=${z}`);
        assertPositiveVolume(occt, shape, `split body z=${z}`);
        const solids = countSolids(occt, shape);
        assert.ok(solids >= 2, `expected >=2 solids at z=${z}, got ${solids}`);
      }
    },
  },
  {
    name: "occt split stability: body split tolerates non-intersecting tool",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = makeSplitBodyPart("split-body-outside", 20);
      const result = buildPart(part, backend);
      const split = result.final.outputs.get("body:split");
      assert.ok(split, "missing split output");
      const shape = split.meta["shape"] as any;
      assertValidShape(occt, shape, "split body non-intersecting tool");
      assertPositiveVolume(occt, shape, "split body non-intersecting tool");
      const solids = countSolids(occt, shape);
      assert.ok(solids >= 1, `expected >=1 solid with non-intersecting tool, got ${solids}`);
    },
  },
  {
    name: "occt split stability: split face increases owner face count across orientations",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const orientations: Array<"+X" | "+Y"> = ["+X", "+Y"];
      for (const normal of orientations) {
        const unsplit = dsl.part(`split-face-base-${normal}`, [
          dsl.sketch2d("sketch-base", [
            { name: "profile:base", profile: dsl.profileRect(20, 12) },
          ]),
          dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
            "sketch-base",
          ]),
        ]);
        const unsplitResult = buildPart(unsplit, backend);
        const unsplitBody = unsplitResult.final.outputs.get("body:main");
        assert.ok(unsplitBody, `missing unsplit body for ${normal}`);
        const unsplitShape = unsplitBody.meta["shape"] as any;
        const baseFaceCount = countFaces(occt, unsplitShape);

        const split = makeSplitFacePart(`split-face-${normal}`, normal);
        const splitResult = buildPart(split, backend);
        const splitBody = splitResult.final.outputs.get("body:split");
        assert.ok(splitBody, `missing split face output for ${normal}`);
        const splitShape = splitBody.meta["shape"] as any;
        assertValidShape(occt, splitShape, `split face ${normal}`);
        assertPositiveVolume(occt, splitShape, `split face ${normal}`);
        const splitFaceCount = countFaces(occt, splitShape);
        assert.ok(
          splitFaceCount > baseFaceCount,
          `expected split face count > base (${splitFaceCount} <= ${baseFaceCount}) for ${normal}`
        );
      }
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
