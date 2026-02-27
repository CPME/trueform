import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countFaces,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

function topStableEdgeIds(
  selections: Array<{
    id: string;
    kind: string;
    meta: Record<string, unknown>;
  }>,
  createdBy: string,
  minZ: number
): string[] {
  const out: string[] = [];
  for (const selection of selections) {
    if (selection.kind !== "edge") continue;
    if (selection.meta["createdBy"] !== createdBy) continue;
    const center = selection.meta["center"];
    if (!Array.isArray(center) || center.length !== 3) continue;
    const z = center[2];
    if (typeof z !== "number" || !Number.isFinite(z) || z < minZ) continue;
    if (!out.includes(selection.id)) out.push(selection.id);
  }
  out.sort();
  return out;
}

const tests = [
  {
    name: "occt e2e: stable edge id keeps fillet resolved after upstream edits",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const seed = buildPart(
        dsl.part("selector-stability-fillet-seed", [
          dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:main"),
        ]),
        backend
      );
      const edgeId = topStableEdgeIds(seed.final.selections as any[], "base", 9.5)[0];
      assert.ok(edgeId, "missing seed stable edge id for fillet");

      const edited = dsl.part("selector-stability-fillet-edited", [
        dsl.fillet("edge-fillet", dsl.selectorNamed(edgeId), 1),
        dsl.extrude("base", dsl.profileRect(28, 16), 24, "body:main"),
      ]);
      const result = buildPart(edited, backend);
      assert.ok(
        result.order.indexOf("base") < result.order.indexOf("edge-fillet"),
        `expected stable edge id to anchor fillet ordering (order=${result.order.join(",")})`
      );

      const baseStep = result.steps[0];
      const filletStep = result.steps[1];
      assert.equal(baseStep?.featureId, "base");
      assert.equal(filletStep?.featureId, "edge-fillet");
      assert.equal(
        baseStep?.result.selections.some((selection) => selection.id === edgeId),
        true,
        "expected edited base build to preserve the captured fillet edge id"
      );

      const baseBody = baseStep?.result.outputs.get("body:main");
      const finalBody = result.final.outputs.get("body:main");
      assert.ok(baseBody, "missing edited base body:main");
      assert.ok(finalBody, "missing final filleted body:main");
      const baseShape = baseBody.meta["shape"] as any;
      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(baseShape, "missing edited base shape");
      assert.ok(finalShape, "missing filleted shape");
      assertValidShape(occt, finalShape, "stable-id fillet solid");
      assert.ok(
        countFaces(occt, finalShape) > countFaces(occt, baseShape),
        "expected stable-id fillet to add faces after the upstream edit"
      );
    },
  },
  {
    name: "occt e2e: stable edge id keeps chamfer resolved after upstream edits",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const seed = buildPart(
        dsl.part("selector-stability-chamfer-seed", [
          dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:main"),
        ]),
        backend
      );
      const edgeId = topStableEdgeIds(seed.final.selections as any[], "base", 9.5)[0];
      assert.ok(edgeId, "missing seed stable edge id for chamfer");

      const edited = dsl.part("selector-stability-chamfer-edited", [
        dsl.chamfer("edge-chamfer", dsl.selectorNamed(edgeId), 1.25),
        dsl.extrude("base", dsl.profileRect(26, 18), 22, "body:main"),
      ]);
      const result = buildPart(edited, backend);
      assert.ok(
        result.order.indexOf("base") < result.order.indexOf("edge-chamfer"),
        `expected stable edge id to anchor chamfer ordering (order=${result.order.join(",")})`
      );

      const baseStep = result.steps[0];
      const chamferStep = result.steps[1];
      assert.equal(baseStep?.featureId, "base");
      assert.equal(chamferStep?.featureId, "edge-chamfer");
      assert.equal(
        baseStep?.result.selections.some((selection) => selection.id === edgeId),
        true,
        "expected edited base build to preserve the captured chamfer edge id"
      );

      const baseBody = baseStep?.result.outputs.get("body:main");
      const finalBody = result.final.outputs.get("body:main");
      assert.ok(baseBody, "missing edited base body:main");
      assert.ok(finalBody, "missing final chamfered body:main");
      const baseShape = baseBody.meta["shape"] as any;
      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(baseShape, "missing edited base shape");
      assert.ok(finalShape, "missing chamfered shape");
      assertValidShape(occt, finalShape, "stable-id chamfer solid");
      assert.ok(
        countFaces(occt, finalShape) > countFaces(occt, baseShape),
        "expected stable-id chamfer to add faces after the upstream edit"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
