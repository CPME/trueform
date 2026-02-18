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
    name: "occt e2e: fillet on cylinder edge adds faces",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("fillet-cylinder", [
        dsl.extrude("cyl", dsl.profileCircle(10), 20, "body:main"),
        dsl.fillet(
          "edge-fillet",
          dsl.selectorEdge(
            [dsl.predCreatedBy("cyl")],
            [dsl.rankMaxZ()]
          ),
          2,
          ["cyl"]
        ),
      ]);

      const result = buildPart(part, backend);
      const baseStep = result.steps[0];
      const filletStep = result.steps[1];
      assert.ok(baseStep && filletStep, "expected base and fillet steps");

      const baseBody = baseStep.result.outputs.get("body:main");
      const finalBody = result.final.outputs.get("body:main");
      assert.ok(baseBody, "missing base body:main output");
      assert.ok(finalBody, "missing final body:main output");

      const baseShape = baseBody.meta["shape"] as any;
      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(baseShape, "missing base shape metadata");
      assert.ok(finalShape, "missing final shape metadata");
      assertValidShape(occt, baseShape, "base solid");
      assertValidShape(occt, finalShape, "fillet solid");

      const baseFaces = countFaces(occt, baseShape);
      const finalFaces = countFaces(occt, finalShape);
      assert.ok(
        finalFaces > baseFaces,
        `expected fillet to add faces (base=${baseFaces}, final=${finalFaces})`
      );
    },
  },
  {
    name: "occt e2e: mesh can include tangent edges for fillet wireframe",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("fillet-cylinder-wire", [
        dsl.extrude("cyl", dsl.profileCircle(10), 20, "body:main"),
        dsl.fillet(
          "edge-fillet",
          dsl.selectorEdge(
            [dsl.predCreatedBy("cyl")],
            [dsl.rankMaxZ()]
          ),
          2,
          ["cyl"]
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing final body:main output");

      const defaultMesh = backend.mesh(output, {
        linearDeflection: 0.2,
        angularDeflection: 0.2,
        includeEdges: true,
      });
      const tangentMesh = backend.mesh(output, {
        linearDeflection: 0.2,
        angularDeflection: 0.2,
        includeEdges: true,
        includeTangentEdges: true,
      });
      const defaultEdges = defaultMesh.edgePositions?.length ?? 0;
      const tangentEdges = tangentMesh.edgePositions?.length ?? 0;
      assert.ok(
        tangentEdges > defaultEdges,
        `expected tangent edges to increase edge segments (default=${defaultEdges}, tangent=${tangentEdges})`
      );
    },
  },
  {
    name: "occt e2e: fillet accepts explicit selector.named edge id lists",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const basePart = dsl.part("fillet-explicit-base", [
        dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:main"),
      ]);
      const baseBuild = buildPart(basePart, backend);
      const baseOutput = baseBuild.final.outputs.get("body:main");
      assert.ok(baseOutput, "missing base body:main output");
      const explicitEdgeIds = baseBuild.final.selections
        .filter((selection) => selection.kind === "edge")
        .filter((selection) => {
          const center = selection.meta["center"];
          return Array.isArray(center) && center.length === 3 && center[2] >= 9.5;
        })
        .map((selection) => selection.id)
        .filter((id, index, list) => list.indexOf(id) === index)
        .slice(0, 2);
      assert.equal(explicitEdgeIds.length, 2, "expected at least two top edge selections");

      const filletPart = dsl.part("fillet-explicit", [
        dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:main"),
        dsl.fillet(
          "edge-fillet",
          dsl.selectorNamed(explicitEdgeIds.join(", ")),
          1,
          ["base"]
        ),
      ]);
      const result = buildPart(filletPart, backend);
      const finalBody = result.final.outputs.get("body:main");
      assert.ok(finalBody, "missing final body:main output");

      const baseShape = baseOutput.meta["shape"] as any;
      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(baseShape, "missing base shape metadata");
      assert.ok(finalShape, "missing final shape metadata");
      assertValidShape(occt, finalShape, "fillet solid");

      const baseFaces = countFaces(occt, baseShape);
      const finalFaces = countFaces(occt, finalShape);
      assert.ok(
        finalFaces > baseFaces,
        `expected fillet from explicit edge ids to add faces (base=${baseFaces}, final=${finalFaces})`
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
