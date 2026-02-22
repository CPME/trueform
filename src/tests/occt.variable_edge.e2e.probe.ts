import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countFaces,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt parity probe: variable fillet applies per-entry radii",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("variable-fillet-probe", [
        dsl.extrude("base", dsl.profileCircle(12), 16, "body:main"),
        dsl.variableFillet(
          "fillet-var",
          dsl.selectorNamed("body:main"),
          [
            {
              edge: dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMaxZ()]),
              radius: 1.6,
            },
            {
              edge: dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMinZ()]),
              radius: 0.8,
            },
          ],
          "body:filleted",
          ["base"]
        ),
      ]);

      const result = buildPart(part, backend);
      const base = result.steps[0]?.result.outputs.get("body:main");
      const finalBody = result.final.outputs.get("body:filleted");
      assert.ok(base, "missing base body output");
      assert.ok(finalBody, "missing variable fillet output");

      const baseShape = base.meta["shape"] as any;
      const finalShape = finalBody.meta["shape"] as any;
      assertValidShape(occt, baseShape, "variable fillet base");
      assertValidShape(occt, finalShape, "variable fillet result");
      assert.ok(
        countFaces(occt, finalShape) > countFaces(occt, baseShape),
        "expected variable fillet to add faces"
      );
    },
  },
  {
    name: "occt parity probe: variable chamfer applies per-entry distances",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("variable-chamfer-probe", [
        dsl.extrude("base", dsl.profileCircle(12), 16, "body:main"),
        dsl.variableChamfer(
          "chamfer-var",
          dsl.selectorNamed("body:main"),
          [
            {
              edge: dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMaxZ()]),
              distance: 1.2,
            },
            {
              edge: dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMinZ()]),
              distance: 0.6,
            },
          ],
          "body:chamfered",
          ["base"]
        ),
      ]);

      const result = buildPart(part, backend);
      const base = result.steps[0]?.result.outputs.get("body:main");
      const finalBody = result.final.outputs.get("body:chamfered");
      assert.ok(base, "missing base body output");
      assert.ok(finalBody, "missing variable chamfer output");

      const baseShape = base.meta["shape"] as any;
      const finalShape = finalBody.meta["shape"] as any;
      assertValidShape(occt, baseShape, "variable chamfer base");
      assertValidShape(occt, finalShape, "variable chamfer result");
      assert.ok(
        countFaces(occt, finalShape) > countFaces(occt, baseShape),
        "expected variable chamfer to add faces"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
