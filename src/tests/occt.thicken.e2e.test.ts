import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: thicken turns a surface into a solid",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const rect = dsl.sketchRectCorner("rect-1", [-10, -5], 20, 10);
      const sketch = dsl.sketch2d(
        "sketch-face",
        [{ name: "profile:rect", profile: dsl.profileSketchLoop(["rect-1"]) }],
        { entities: [rect] }
      );
      const surface = dsl.surface(
        "face-1",
        dsl.profileRef("profile:rect"),
        "surface:main"
      );
      const thicken = dsl.thicken(
        "thicken-1",
        dsl.selectorNamed("surface:main"),
        4,
        "body:main"
      );
      const part = dsl.part("thicken-test", [sketch, surface, thicken]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing thicken output");
      assert.equal(output.kind, "solid");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "thicken shape");
      assert.ok(countSolids(occt, shape) >= 1, "expected solid result");
    },
  },
  {
    name: "occt e2e: thicken supports curved surfaces",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const surface = dsl.revolve(
        "revolve-1",
        dsl.profileCircle(3, [6, 0, 0]),
        "+Z",
        "full",
        "surface:main",
        { mode: "surface" }
      );
      const thicken = dsl.thicken(
        "thicken-2",
        dsl.selectorNamed("surface:main"),
        2,
        "body:main"
      );
      const part = dsl.part("thicken-curved", [surface, thicken]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing thicken output");
      assert.equal(output.kind, "solid");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "thicken curved shape");
      assert.ok(countSolids(occt, shape) >= 1, "expected solid result");
    },
  },
  {
    name: "occt e2e: thicken turns an open surface into a solid",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const line = dsl.sketchLine("line-1", [10, 0], [10, 16]);
      const sketch = dsl.sketch2d(
        "sketch-thicken-surface",
        [
          {
            name: "profile:open",
            profile: dsl.profileSketchLoop(["line-1"], { open: true }),
          },
        ],
        { plane: dsl.planeDatum("sketch-plane"), entities: [line] }
      );
      const surface = dsl.revolve(
        "surface-revolve",
        dsl.profileRef("profile:open"),
        "+Z",
        "full",
        "surface:main",
        { mode: "surface" }
      );
      const thicken = dsl.thicken(
        "thicken-3",
        dsl.selectorNamed("surface:main"),
        4,
        "body:main"
      );
      const part = dsl.part("thicken-open-surface", [
        dsl.datumPlane("sketch-plane", "+Y"),
        sketch,
        surface,
        thicken,
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing thicken output");
      assert.equal(output.kind, "solid");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "thicken open surface");
      assert.ok(countSolids(occt, shape) >= 1, "expected solid result");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
