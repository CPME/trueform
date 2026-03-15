import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { CompileError } from "../errors.js";
import { buildPart, type BuildResult } from "../executor.js";
import {
  assertValidShape,
  countFaces,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

function makeBooleanUnionReplayFeatures() {
  return [
    dsl.sketch2d(
      "base-sketch",
      [
        {
          name: "profile:base",
          profile: dsl.profileSketchLoop([
            "rectangle-1.1",
            "rectangle-1.2",
            "rectangle-1.3",
            "rectangle-1.4",
          ]),
        },
      ],
      {
        entities: [
          dsl.sketchLine("rectangle-1.1", [-10, -10], [10, -10]),
          dsl.sketchLine("rectangle-1.2", [10, -10], [10, 10]),
          dsl.sketchLine("rectangle-1.3", [10, 10], [-10, 10]),
          dsl.sketchLine("rectangle-1.4", [-10, 10], [-10, -10]),
        ],
      }
    ),
    dsl.extrude("base", dsl.profileRef("profile:base"), 10, "body:seed"),
    dsl.fillet(
      "fillet-1",
      dsl.selectorNamed("edge:body.seed~base.side.rectangle-1.1.join.top"),
      2,
      { result: "body:fillet-1" }
    ),
    dsl.sketch2d(
      "boss-sketch",
      [{ name: "profile:boss", profile: dsl.profileSketchLoop(["circle-1"]) }],
      {
        plane: dsl.selectorNamed("face:body.fillet-1~fillet-1.top"),
        entities: [dsl.sketchCircle("circle-1", [6, 6], 4)],
      }
    ),
    dsl.extrude("boss", dsl.profileRef("profile:boss"), 6, "body:boss"),
    dsl.booleanOp(
      "auto-union-1",
      "union",
      dsl.selectorNamed("body:fillet-1"),
      dsl.selectorNamed("body:boss"),
      "body:main"
    ),
  ];
}

function makeBooleanUnionReplayPart(partId: string, replayEdgeId?: string) {
  const features = makeBooleanUnionReplayFeatures();
  if (typeof replayEdgeId === "string" && replayEdgeId.length > 0) {
    features.push(dsl.fillet("fillet-2", dsl.selectorNamed(replayEdgeId), 0.25, ["auto-union-1"]));
  }
  return dsl.part(partId, features);
}

function stepByFeatureId(result: BuildResult, featureId: string) {
  return result.steps.find((step) => step.featureId === featureId);
}

function selectionBySlot(
  result: BuildResult,
  kind: "face" | "edge",
  slot: string
) {
  const step = stepByFeatureId(result, "auto-union-1");
  return step?.result.selections.find(
    (selection) => selection.kind === kind && selection.meta["selectionSlot"] === slot
  );
}

const hashSelectionIdPattern = /^(face|edge):body\.main~auto-union-1\.h[0-9a-f]+(?:\.\d+)?$/i;

const tests = [
  {
    name: "occt boolean union replay: semantic union-result edge ids remain fillet-replay safe",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const seed = buildPart(makeBooleanUnionReplayPart("boolean-union-replay-seed"), backend);
      const semanticEdge = selectionBySlot(seed, "edge", "side.rectangle-1.3.join.side.rectangle-1.4");
      assert.ok(
        semanticEdge,
        "missing semantic union-result edge side.rectangle-1.3.join.side.rectangle-1.4"
      );

      const replayed = buildPart(
        makeBooleanUnionReplayPart("boolean-union-replay-semantic", semanticEdge.id),
        backend
      );
      const unionBody = stepByFeatureId(replayed, "auto-union-1")?.result.outputs.get("body:main");
      const finalBody = replayed.final.outputs.get("body:main");
      assert.ok(unionBody, "missing auto-union-1 body output");
      assert.ok(finalBody, "missing replayed final body output");

      const unionShape = unionBody.meta["shape"] as any;
      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(unionShape, "missing union replay seed shape");
      assert.ok(finalShape, "missing replayed final shape");
      assertValidShape(occt, finalShape, "semantic union edge replay solid");
      assert.ok(
        countFaces(occt, finalShape) > countFaces(occt, unionShape),
        "expected replayed semantic union edge fillet to add faces"
      );
    },
  },
  {
    name: "occt boolean union replay: formerly hash-only preserved faces and edges now emit semantic split ids",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const seed = buildPart(makeBooleanUnionReplayPart("boolean-union-replay-split"), backend);
      const unionStep = stepByFeatureId(seed, "auto-union-1");
      assert.ok(unionStep, "missing auto-union-1 step");

      const unionFaceIds = unionStep.result.selections
        .filter((selection) => selection.kind === "face")
        .map((selection) => selection.id);
      const unionEdgeIds = unionStep.result.selections
        .filter((selection) => selection.kind === "edge")
        .map((selection) => selection.id);
      assert.equal(
        unionFaceIds.some((id) => hashSelectionIdPattern.test(id)),
        false,
        `expected semantic union face ids only, got ${unionFaceIds.join(", ")}`
      );
      assert.equal(
        unionEdgeIds.some((id) => hashSelectionIdPattern.test(id)),
        false,
        `expected semantic union edge ids only, got ${unionEdgeIds.join(", ")}`
      );

      const splitTopA = selectionBySlot(seed, "face", "split.top.branch.1");
      const splitTopB = selectionBySlot(seed, "face", "split.top.branch.2");
      const replayEdge = selectionBySlot(seed, "edge", "side.rectangle-1.3.join.split.top.branch.2");
      assert.ok(splitTopA, "missing split.top.branch.1 face selection");
      assert.ok(splitTopB, "missing split.top.branch.2 face selection");
      assert.ok(
        replayEdge,
        "missing semantic replacement for previously hash-only union edge"
      );

      const replayed = buildPart(
        makeBooleanUnionReplayPart("boolean-union-replay-split-edge", replayEdge.id),
        backend
      );
      const unionBody = stepByFeatureId(replayed, "auto-union-1")?.result.outputs.get("body:main");
      const finalBody = replayed.final.outputs.get("body:main");
      assert.ok(unionBody, "missing split replay union body output");
      assert.ok(finalBody, "missing split replay final body output");

      const unionShape = unionBody.meta["shape"] as any;
      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(unionShape, "missing split replay union shape");
      assert.ok(finalShape, "missing split replay final shape");
      assertValidShape(occt, finalShape, "formerly hash-only union edge replay solid");
      assert.ok(
        countFaces(occt, finalShape) > countFaces(occt, unionShape),
        "expected formerly hash-only union edge replay to add faces"
      );
    },
  },
  {
    name: "occt boolean union replay: emitted union edge ids never regress to selector_named_missing",
    fn: async () => {
      const { backend } = await getBackendContext();
      const seed = buildPart(makeBooleanUnionReplayPart("boolean-union-replay-scan"), backend);
      const unionStep = stepByFeatureId(seed, "auto-union-1");
      assert.ok(unionStep, "missing auto-union-1 step");

      const edgeIds = unionStep.result.selections
        .filter((selection) => selection.kind === "edge")
        .map((selection) => selection.id);
      const selectorFailures: string[] = [];
      for (const edgeId of edgeIds) {
        try {
          buildPart(makeBooleanUnionReplayPart(`boolean-union-replay-${edgeId}`, edgeId), backend);
        } catch (err) {
          if (err instanceof CompileError && err.code === "selector_named_missing") {
            selectorFailures.push(edgeId);
          }
        }
      }

      assert.deepEqual(selectorFailures, []);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
