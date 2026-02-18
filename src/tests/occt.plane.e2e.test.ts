import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countEdges,
  countFaces,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: plane feature creates a rectangular face on a datum plane",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("plane-from-datum", [
        dsl.datumPlane("plane-datum", "+X"),
        dsl.plane("plane-1", 30, 18, "surface:main", {
          plane: dsl.planeDatum("plane-datum"),
        }),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:main");
      assert.ok(output, "missing surface:main output");
      assert.equal(output.kind, "face");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "plane face");
      assert.equal(countSolids(occt, shape), 0);
      assert.equal(countFaces(occt, shape), 1);
      assert.equal(countEdges(occt, shape), 4);
    },
  },
  {
    name: "occt e2e: plane feature can reference a planar face selector",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("plane-from-face", [
        dsl.extrude("base", dsl.profileRect(40, 24), 8, "body:base"),
        dsl.plane("plane-2", 16, 10, "surface:offset", {
          plane: dsl.selectorFace(
            [dsl.predCreatedBy("base"), dsl.predPlanar(), dsl.predNormal("+Z")],
            [dsl.rankMaxArea()]
          ),
          origin: [0, 0, 2],
        }),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:offset");
      assert.ok(output, "missing surface:offset output");
      assert.equal(output.kind, "face");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "plane from selector face");
      assert.equal(countSolids(occt, shape), 0);
      assert.equal(countFaces(occt, shape), 1);
      assert.equal(countEdges(occt, shape), 4);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
