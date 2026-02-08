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
    name: "occt e2e: counterbore adds faces beyond a simple hole",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const base = () => dsl.extrude("base", dsl.profileRect(80, 40), 12, "body:main");
      const simplePart = dsl.part("plate-simple", [
        base(),
        dsl.hole(
          "hole-simple",
          dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()]),
          "-Z",
          8,
          "throughAll",
          { deps: ["base"] }
        ),
      ]);
      const counterborePart = dsl.part("plate-counterbore", [
        base(),
        dsl.hole(
          "hole-counterbore",
          dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()]),
          "-Z",
          8,
          "throughAll",
          { counterbore: { diameter: 16, depth: 4 }, deps: ["base"] }
        ),
      ]);

      const simpleResult = buildPart(simplePart, backend);
      const counterResult = buildPart(counterborePart, backend);

      const simpleBody = simpleResult.final.outputs.get("body:main");
      const counterBody = counterResult.final.outputs.get("body:main");
      assert.ok(simpleBody, "missing simple hole body:main output");
      assert.ok(counterBody, "missing counterbore body:main output");

      const simpleShape = simpleBody.meta["shape"] as any;
      const counterShape = counterBody.meta["shape"] as any;
      assertValidShape(occt, simpleShape, "simple hole solid");
      assertValidShape(occt, counterShape, "counterbore solid");

      const simpleFaces = countFaces(occt, simpleShape);
      const counterFaces = countFaces(occt, counterShape);
      assert.ok(
        counterFaces > simpleFaces,
        `expected counterbore to add faces (simple=${simpleFaces}, counter=${counterFaces})`
      );
      assert.equal(countSolids(occt, counterShape), 1, "expected single counterbore solid");
    },
  },
  {
    name: "occt e2e: countersink adds faces beyond a simple hole",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const base = () => dsl.extrude("base", dsl.profileRect(80, 40), 12, "body:main");
      const simplePart = dsl.part("plate-simple", [
        base(),
        dsl.hole(
          "hole-simple",
          dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()]),
          "-Z",
          8,
          "throughAll",
          { deps: ["base"] }
        ),
      ]);
      const countersinkPart = dsl.part("plate-countersink", [
        base(),
        dsl.hole(
          "hole-countersink",
          dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()]),
          "-Z",
          8,
          "throughAll",
          { countersink: { diameter: 18, angle: Math.PI / 2 }, deps: ["base"] }
        ),
      ]);

      const simpleResult = buildPart(simplePart, backend);
      const sinkResult = buildPart(countersinkPart, backend);

      const simpleBody = simpleResult.final.outputs.get("body:main");
      const sinkBody = sinkResult.final.outputs.get("body:main");
      assert.ok(simpleBody, "missing simple hole body:main output");
      assert.ok(sinkBody, "missing countersink body:main output");

      const simpleShape = simpleBody.meta["shape"] as any;
      const sinkShape = sinkBody.meta["shape"] as any;
      assertValidShape(occt, simpleShape, "simple hole solid");
      assertValidShape(occt, sinkShape, "countersink solid");

      const simpleFaces = countFaces(occt, simpleShape);
      const sinkFaces = countFaces(occt, sinkShape);
      assert.ok(
        sinkFaces > simpleFaces,
        `expected countersink to add faces (simple=${simpleFaces}, sink=${sinkFaces})`
      );
      assert.equal(countSolids(occt, sinkShape), 1, "expected single countersink solid");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
