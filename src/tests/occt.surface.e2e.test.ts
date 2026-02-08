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
    name: "occt e2e: surface from closed sketch produces face output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const rect = dsl.sketchRectCorner("rect-1", [-10, -5], 20, 10);
      const sketch = dsl.sketch2d(
        "sketch-surface",
        [
          {
            name: "profile:rect",
            profile: dsl.profileSketchLoop(["rect-1"]),
          },
        ],
        { entities: [rect] }
      );
      const part = dsl.part("surface-face", [
        sketch,
        dsl.surface("surface-1", dsl.profileRef("profile:rect"), "surface:main"),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:main");
      assert.ok(output, "missing surface output");
      assert.equal(output.kind, "face");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "surface face");
      assert.equal(countSolids(occt, shape), 0);
      assert.ok(countFaces(occt, shape) >= 1, "expected surface to have faces");
    },
  },
  {
    name: "occt e2e: extrude surface from open sketch produces shell",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const line = dsl.sketchLine("line-1", [0, 0], [30, 0]);
      const sketch = dsl.sketch2d(
        "sketch-open",
        [
          {
            name: "profile:open",
            profile: dsl.profileSketchLoop(["line-1"], { open: true }),
          },
        ],
        { origin: [0, 0, 0], entities: [line] }
      );
      const part = dsl.part("extrude-surface", [
        sketch,
        dsl.extrude(
          "surface-extrude",
          dsl.profileRef("profile:open"),
          10,
          "surface:wall",
          undefined,
          { mode: "surface" }
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:wall");
      assert.ok(output, "missing surface output");
      assert.equal(output.kind, "face");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "extrude surface");
      assert.equal(countSolids(occt, shape), 0);
      assert.ok(countFaces(occt, shape) > 0, "expected surface to have faces");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
