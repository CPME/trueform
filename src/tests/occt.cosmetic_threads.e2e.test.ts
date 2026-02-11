import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  appendCosmeticThreadEdges,
  buildResolutionContext,
} from "../viewer/cosmetic_threads.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: cosmetic thread edges add wireframe rings",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const base = dsl.extrude("base", dsl.profileCircle(10), 24, "body:main");
      const target = dsl.refSurface(
        dsl.selectorFace([dsl.predCreatedBy("base")], [dsl.rankMaxArea()])
      );
      const part = dsl.part(
        "thread-cosmetic-test",
        [base],
        {
          cosmeticThreads: [
            dsl.cosmeticThread("thread-1", target, {
              designation: "M8x1.25-6H",
              length: 12,
              internal: true,
            }),
          ],
        }
      );

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const mesh = backend.mesh(body, {
        linearDeflection: 0.5,
        angularDeflection: 0.5,
        parallel: true,
      });
      const baselineEdges = mesh.edgePositions?.length ?? 0;
      const resolution = buildResolutionContext(result.final);
      const withThreads = appendCosmeticThreadEdges(mesh, part, resolution, occt);
      const updatedEdges = withThreads.edgePositions?.length ?? 0;

      assert.ok(updatedEdges > baselineEdges, "expected cosmetic thread edges");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
