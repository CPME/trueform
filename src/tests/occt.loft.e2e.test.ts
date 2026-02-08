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

const tests = [
  {
    name: "occt e2e: loft between closed profiles produces solid",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("loft-solid", [
        dsl.loft(
          "loft-solid",
          [
            dsl.profileCircle(10, [0, 0, 0]),
            dsl.profilePoly(6, 16, [0, 0, 24], Math.PI / 6),
          ],
          "body:main"
        ),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "loft solid");
      assertPositiveVolume(occt, shape, "loft solid");
      const solids = countSolids(occt, shape);
      assert.ok(solids > 0, `expected loft to produce solids, got ${solids}`);
    },
  },
  {
    name: "occt e2e: loft between open sketches produces surface",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const lineA = dsl.sketchLine("line-a", [0, 0], [24, 0]);
      const lineB = dsl.sketchLine("line-b", [0, 0], [30, 0]);
      const sketchA = dsl.sketch2d(
        "sketch-a",
        [
          {
            name: "profile:a",
            profile: dsl.profileSketchLoop(["line-a"], { open: true }),
          },
        ],
        { origin: [0, 0, 0], entities: [lineA] }
      );
      const sketchB = dsl.sketch2d(
        "sketch-b",
        [
          {
            name: "profile:b",
            profile: dsl.profileSketchLoop(["line-b"], { open: true }),
          },
        ],
        { origin: [0, 0, 20], entities: [lineB] }
      );
      const part = dsl.part("loft-open", [
        sketchA,
        sketchB,
        dsl.loft(
          "loft-open",
          [dsl.profileRef("profile:a"), dsl.profileRef("profile:b")],
          "body:main"
        ),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "loft surface");
      const solids = countSolids(occt, shape);
      assert.ok(solids === 0, `expected loft surface, got ${solids} solids`);
      const faces = countFaces(occt, shape);
      assert.ok(faces > 0, "expected loft surface to have faces");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
