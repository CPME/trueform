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
    name: "occt e2e: mesh includes fillet wireframe edges by default",
    fn: async () => {
      const { backend } = await getBackendContext();
      const height = 20;
      const part = dsl.part("fillet-cylinder-wire", [
        dsl.extrude("cyl", dsl.profileCircle(10), height, "body:main"),
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
      const hiddenTangentMesh = backend.mesh(output, {
        linearDeflection: 0.2,
        angularDeflection: 0.2,
        includeEdges: true,
        hideTangentEdges: true,
      });
      const explicitIncludeMesh = backend.mesh(output, {
        linearDeflection: 0.2,
        angularDeflection: 0.2,
        includeEdges: true,
        includeTangentEdges: true,
        hideTangentEdges: true,
      });
      const defaultEdges = defaultMesh.edgePositions?.length ?? 0;
      const tangentEdges = tangentMesh.edgePositions?.length ?? 0;
      const hiddenEdges = hiddenTangentMesh.edgePositions?.length ?? 0;
      const explicitIncludeEdges = explicitIncludeMesh.edgePositions?.length ?? 0;
      assert.ok(
        defaultEdges > 0,
        "expected default wireframe edge segments for fillet body"
      );

      const defaultPositions = defaultMesh.edgePositions ?? [];
      let topSegments = 0;
      for (let i = 0; i + 5 < defaultPositions.length; i += 6) {
        const za = defaultPositions[i + 2] ?? 0;
        const zb = defaultPositions[i + 5] ?? 0;
        const zMid = (za + zb) / 2;
        if (zMid > height * 0.75) {
          topSegments += 1;
        }
      }
      assert.ok(
        topSegments > 0,
        `expected fillet wireframe segments near top blend zone, got ${topSegments}`
      );

      assert.ok(
        tangentEdges >= defaultEdges,
        `expected includeTangentEdges to keep or add segments (default=${defaultEdges}, tangent=${tangentEdges})`
      );
      assert.ok(
        hiddenEdges < defaultEdges,
        `expected hideTangentEdges to drop smooth transition edges (default=${defaultEdges}, hidden=${hiddenEdges})`
      );
      assert.equal(
        explicitIncludeEdges,
        tangentEdges,
        "expected includeTangentEdges to override hideTangentEdges when both are set"
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
  {
    name: "occt e2e: fillet can publish named result for downstream selectors",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("fillet-named-result", [
        dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:seed"),
        dsl.fillet(
          "fillet-1",
          dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMaxZ()]),
          1,
          { result: "body:fillet-1" }
        ),
        dsl.extrude("tool", dsl.profileRect(8, 8, [6, 0, 0]), 10, "body:tool"),
        dsl.booleanOp(
          "union-1",
          "union",
          dsl.selectorNamed("body:fillet-1"),
          dsl.selectorNamed("body:tool"),
          "body:main"
        ),
      ]);

      const result = buildPart(part, backend);
      const filletBody = result.steps[1]?.result.outputs.get("body:fillet-1");
      assert.ok(filletBody, "missing fillet named output");
      const finalBody = result.final.outputs.get("body:main");
      assert.ok(finalBody, "missing boolean output body:main");

      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(finalShape, "missing final shape metadata");
      assertValidShape(occt, finalShape, "fillet named-output union solid");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
