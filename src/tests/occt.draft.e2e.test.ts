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
    name: "occt e2e: draft applies taper to selected faces",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("draft-test", [
        dsl.extrude("base", dsl.profileRect(40, 20), 20, "body:base"),
        dsl.datumPlane("draft-neutral", "+Z", [0, 0, 0]),
        dsl.draft(
          "draft-1",
          dsl.selectorNamed("body:base"),
          dsl.selectorFace([
            dsl.predCreatedBy("base"),
            dsl.predPlanar(),
            dsl.predNormal("+X"),
          ]),
          dsl.planeDatum("draft-neutral"),
          "+Z",
          Math.PI / 60,
          "body:main",
          ["base", "draft-neutral"]
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing draft output");
      assert.equal(output.kind, "solid");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "draft solid");
      assert.ok(countSolids(occt, shape) >= 1, "expected solid output");
    },
  },
  {
    name: "occt e2e: draft fails when face selector matches no faces",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("draft-failure-no-faces", [
        dsl.extrude("base", dsl.profileRect(40, 20), 20, "body:base"),
        dsl.datumPlane("draft-neutral", "+Z", [0, 0, 0]),
        dsl.draft(
          "draft-1",
          dsl.selectorNamed("body:base"),
          dsl.selectorFace([
            dsl.predCreatedBy("base"),
            dsl.predPlanar(),
            dsl.predNormal("+X"),
            dsl.predNormal("+Y"),
          ]),
          dsl.planeDatum("draft-neutral"),
          "+Z",
          Math.PI / 60,
          "body:main",
          ["base", "draft-neutral"]
        ),
      ]);
      assert.throws(() => buildPart(part, backend), /matched 0/i);
    },
  },
  {
    name: "occt e2e: draft output is deterministic across repeated runs",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("draft-determinism", [
        dsl.extrude("base", dsl.profileRect(40, 20), 20, "body:base"),
        dsl.datumPlane("draft-neutral", "+Z", [0, 0, 0]),
        dsl.draft(
          "draft-1",
          dsl.selectorNamed("body:base"),
          dsl.selectorFace([
            dsl.predCreatedBy("base"),
            dsl.predPlanar(),
            dsl.predNormal("+X"),
          ]),
          dsl.planeDatum("draft-neutral"),
          "+Z",
          Math.PI / 60,
          "body:main",
          ["base", "draft-neutral"]
        ),
      ]);
      const first = buildPart(part, backend);
      const second = buildPart(part, backend);
      const firstOut = first.final.outputs.get("body:main");
      const secondOut = second.final.outputs.get("body:main");
      assert.ok(firstOut, "missing first deterministic draft output");
      assert.ok(secondOut, "missing second deterministic draft output");
      const firstShape = firstOut.meta["shape"] as any;
      const secondShape = secondOut.meta["shape"] as any;
      assertValidShape(occt, firstShape, "first deterministic draft output");
      assertValidShape(occt, secondShape, "second deterministic draft output");
      assert.equal(countSolids(occt, firstShape), countSolids(occt, secondShape));
      assert.equal(countFaces(occt, firstShape), countFaces(occt, secondShape));
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
