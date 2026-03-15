import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart, type BuildResult } from "../executor.js";
import {
  assertValidShape,
  countFaces,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

type SelectionRecord = {
  id: string;
  kind: string;
  meta: Record<string, unknown>;
};

function stepByFeatureId(result: BuildResult, featureId: string) {
  return result.steps.find((step) => step.featureId === featureId);
}

function captureSelectionIdBySlot(
  selections: SelectionRecord[],
  featureId: string,
  kind: "face" | "edge",
  slot: string
): string | null {
  const hit = selections.find(
    (selection) =>
      selection.kind === kind &&
      selection.meta["createdBy"] === featureId &&
      selection.meta["selectionSlot"] === slot
  );
  return hit?.id ?? null;
}

function assertModifierAddedFaces(
  occt: any,
  result: BuildResult,
  sourceFeatureId: string,
  sourceOutputKey: string,
  finalOutputKey: string,
  label: string
): void {
  const sourceStep = stepByFeatureId(result, sourceFeatureId);
  assert.ok(sourceStep, `missing ${sourceFeatureId} step for ${label}`);
  const sourceBody = sourceStep.result.outputs.get(sourceOutputKey);
  const finalBody = result.final.outputs.get(finalOutputKey);
  assert.ok(sourceBody, `missing ${sourceOutputKey} output for ${label}`);
  assert.ok(finalBody, `missing ${finalOutputKey} output for ${label}`);
  const sourceShape = sourceBody.meta["shape"] as any;
  const finalShape = finalBody.meta["shape"] as any;
  assert.ok(sourceShape, `missing source shape for ${label}`);
  assert.ok(finalShape, `missing final shape for ${label}`);
  assertValidShape(occt, finalShape, `${label} solid`);
  assert.ok(
    countFaces(occt, finalShape) > countFaces(occt, sourceShape),
    `expected ${label} to add faces`
  );
}

function makeRevolveSketch(width: number, height: number) {
  return dsl.sketch2d(
    "sketch-profile",
    [
      {
        name: "profile:loop",
        profile: dsl.profileSketchLoop(["line-1", "line-2", "line-3", "line-4"]),
      },
    ],
    {
      entities: [
        dsl.sketchLine("line-1", [2, 0], [2 + width, 0]),
        dsl.sketchLine("line-2", [2 + width, 0], [2 + width, height]),
        dsl.sketchLine("line-3", [2 + width, height], [2, height]),
        dsl.sketchLine("line-4", [2, height], [2, 0]),
      ],
    }
  );
}

const tests = [
  {
    name: "creator edge stability: revolve semantic edge survives owner rename into fillet",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const seed = buildPart(
        dsl.part("creator-stability-revolve-seed", [
          makeRevolveSketch(2, 2),
          dsl.revolve(
            "sketch-revolve",
            dsl.profileRef("profile:loop"),
            "+Y",
            Math.PI,
            "body:main"
          ),
        ]),
        backend
      );
      const selectionId = captureSelectionIdBySlot(
        seed.final.selections as SelectionRecord[],
        "sketch-revolve",
        "edge",
        "profile.line-1.join.profile.line-2"
      );
      assert.ok(selectionId, "missing seed revolve semantic edge");

      const result = buildPart(
        dsl.part("creator-stability-revolve-edited", [
          makeRevolveSketch(2, 2),
          dsl.fillet("edge-fillet", dsl.selectorNamed(selectionId), 0.4),
          dsl.revolve(
            "sketch-revolve",
            dsl.profileRef("profile:loop"),
            "+Y",
            Math.PI,
            "body:renamed"
          ),
        ]),
        backend
      );

      assert.ok(
        result.order.indexOf("sketch-revolve") < result.order.indexOf("edge-fillet"),
        `expected revolve before fillet (order=${result.order.join(",")})`
      );
      const revolveStep = stepByFeatureId(result, "sketch-revolve");
      assert.ok(revolveStep, "missing edited revolve step");
      assert.equal(
        revolveStep.result.selections.some((selection) => selection.id === selectionId),
        false,
        "expected owner rename to change emitted revolve edge id"
      );
      const renamedId = captureSelectionIdBySlot(
        revolveStep.result.selections as SelectionRecord[],
        "sketch-revolve",
        "edge",
        "profile.line-1.join.profile.line-2"
      );
      assert.ok(renamedId, "missing renamed revolve semantic edge");
      assert.ok(
        String(renamedId).startsWith("edge:body.renamed~sketch-revolve."),
        `expected renamed revolve edge id, got ${renamedId ?? ""}`
      );
      assertModifierAddedFaces(
        occt,
        result,
        "sketch-revolve",
        "body:renamed",
        "body:renamed",
        "revolve fillet after owner rename"
      );
    },
  },
  {
    name: "creator edge stability: pipe semantic edge survives owner rename into fillet",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const seed = buildPart(
        dsl.part("creator-stability-pipe-seed", [
          dsl.pipe("pipe-1", "+Z", 80, 60, 40, "body:main"),
        ]),
        backend
      );
      const selectionId = captureSelectionIdBySlot(
        seed.final.selections as SelectionRecord[],
        "pipe-1",
        "edge",
        "outer.bound.start"
      );
      assert.ok(selectionId, "missing seed pipe semantic edge");

      const result = buildPart(
        dsl.part("creator-stability-pipe-edited", [
          dsl.fillet("edge-fillet", dsl.selectorNamed(selectionId), 3),
          dsl.pipe("pipe-1", "+Z", 80, 60, 40, "body:renamed"),
        ]),
        backend
      );

      assert.ok(
        result.order.indexOf("pipe-1") < result.order.indexOf("edge-fillet"),
        `expected pipe before fillet (order=${result.order.join(",")})`
      );
      const pipeStep = stepByFeatureId(result, "pipe-1");
      assert.ok(pipeStep, "missing edited pipe step");
      assert.equal(
        pipeStep.result.selections.some((selection) => selection.id === selectionId),
        false,
        "expected owner rename to change emitted pipe edge id"
      );
      const renamedId = captureSelectionIdBySlot(
        pipeStep.result.selections as SelectionRecord[],
        "pipe-1",
        "edge",
        "outer.bound.start"
      );
      assert.ok(renamedId, "missing renamed pipe semantic edge");
      assert.ok(
        String(renamedId).startsWith("edge:body.renamed~pipe-1."),
        `expected renamed pipe edge id, got ${renamedId ?? ""}`
      );
      assertModifierAddedFaces(
        occt,
        result,
        "pipe-1",
        "body:renamed",
        "body:renamed",
        "pipe fillet after owner rename"
      );
    },
  },
  {
    name: "creator edge stability: pipe sweep semantic edge survives diameter edits into chamfer",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const path = dsl.pathSegments([
        dsl.pathArc([40, 0, 0], [0, 40, 0], [0, 0, 0], "ccw"),
      ]);
      const seed = buildPart(
        dsl.part("creator-stability-pipe-sweep-seed", [
          dsl.pipeSweep("sweep-1", path, 20, 10, "body:main"),
        ]),
        backend
      );
      const selectionId = captureSelectionIdBySlot(
        seed.final.selections as SelectionRecord[],
        "sweep-1",
        "edge",
        "outer.bound.start"
      );
      assert.ok(selectionId, "missing seed pipe sweep semantic edge");

      const result = buildPart(
        dsl.part("creator-stability-pipe-sweep-edited", [
          dsl.chamfer("edge-chamfer", dsl.selectorNamed(selectionId), 2),
          dsl.pipeSweep("sweep-1", path, 22, 10, "body:main"),
        ]),
        backend
      );

      assert.ok(
        result.order.indexOf("sweep-1") < result.order.indexOf("edge-chamfer"),
        `expected pipe sweep before chamfer (order=${result.order.join(",")})`
      );
      const sweepStep = stepByFeatureId(result, "sweep-1");
      assert.ok(sweepStep, "missing edited pipe sweep step");
      assert.equal(
        sweepStep.result.selections.some((selection) => selection.id === selectionId),
        true,
        "expected path edits to preserve canonical pipe sweep edge id"
      );
      assertModifierAddedFaces(
        occt,
        result,
        "sweep-1",
        "body:main",
        "body:main",
        "pipe sweep chamfer after diameter edit"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
