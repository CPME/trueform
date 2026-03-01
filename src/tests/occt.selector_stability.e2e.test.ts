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

type MatrixCase = {
  name: string;
  buildSeedPart: () => ReturnType<typeof dsl.part>;
  captureSelectionId: (selections: SelectionRecord[]) => string | null;
  buildEditedPart: (selectionId: string) => ReturnType<typeof dsl.part>;
  assertEdited: (args: {
    occt: any;
    result: BuildResult;
    selectionId: string;
  }) => void;
};

function findSelectionId(
  selections: SelectionRecord[],
  predicate: (selection: SelectionRecord) => boolean
): string | null {
  for (const selection of selections) {
    if (predicate(selection)) return selection.id;
  }
  return null;
}

function topStableEdgeId(selections: SelectionRecord[]): string | null {
  return findSelectionId(selections, (selection) => {
    if (selection.kind !== "edge") return false;
    if (selection.meta["createdBy"] !== "base") return false;
    const center = selection.meta["center"];
    return (
      Array.isArray(center) &&
      center.length === 3 &&
      typeof center[2] === "number" &&
      Number.isFinite(center[2]) &&
      center[2] >= 9.5
    );
  });
}

function topStableFaceId(selections: SelectionRecord[]): string | null {
  return findSelectionId(
    selections,
    (selection) =>
      selection.kind === "face" &&
      selection.meta["createdBy"] === "base" &&
      selection.meta["normal"] === "+Z"
  );
}

function sideStableFaceId(selections: SelectionRecord[]): string | null {
  return findSelectionId(
    selections,
    (selection) =>
      selection.kind === "face" &&
      selection.meta["createdBy"] === "base" &&
      selection.meta["normal"] === "+X"
  );
}

function subtractCutBottomStableFaceId(selections: SelectionRecord[]): string | null {
  return findSelectionId(
    selections,
    (selection) =>
      selection.kind === "face" &&
      selection.meta["createdBy"] === "subtract-1" &&
      selection.meta["selectionSlot"] === "cut.bottom"
  );
}

function stepByFeatureId(result: BuildResult, featureId: string) {
  return result.steps.find((step) => step.featureId === featureId);
}

function assertFeatureSelectionPreserved(
  result: BuildResult,
  featureId: string,
  selectionId: string,
  label: string
): void {
  const step = stepByFeatureId(result, featureId);
  assert.ok(step, `missing ${featureId} step for ${label}`);
  assert.equal(
    step.result.selections.some((selection) => selection.id === selectionId),
    true,
    `expected edited ${featureId} build to preserve captured ${label} selection id`
  );
}

function assertBaseSelectionPreserved(result: BuildResult, selectionId: string, label: string): void {
  assertFeatureSelectionPreserved(result, "base", selectionId, label);
}

function assertBodyFaceIncrease(
  occt: any,
  result: BuildResult,
  selectionId: string,
  featureId: string,
  finalOutputKey: string,
  label: string,
  baseOutputKey = "body:main"
): void {
  assertBaseSelectionPreserved(result, selectionId, label);
  const baseStep = stepByFeatureId(result, "base");
  const featureStep = stepByFeatureId(result, featureId);
  assert.ok(baseStep, `missing base step for ${label}`);
  assert.ok(featureStep, `missing ${featureId} step for ${label}`);
  const baseBody = baseStep.result.outputs.get(baseOutputKey);
  const finalBody = result.final.outputs.get(finalOutputKey);
  assert.ok(baseBody, `missing edited base output ${baseOutputKey} for ${label}`);
  assert.ok(finalBody, `missing final output ${finalOutputKey} for ${label}`);
  const baseShape = baseBody.meta["shape"] as any;
  const finalShape = finalBody.meta["shape"] as any;
  assert.ok(baseShape, `missing edited base shape for ${label}`);
  assert.ok(finalShape, `missing final shape for ${label}`);
  assertValidShape(occt, finalShape, `${label} solid`);
  assert.ok(
    countFaces(occt, finalShape) > countFaces(occt, baseShape),
    `expected ${label} to add faces after the upstream edit`
  );
}

const matrix: MatrixCase[] = [
  {
    name: "stable face id keeps hole resolved after upstream edits",
    buildSeedPart: () =>
      dsl.part("selector-matrix-seed-hole", [
        dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:main"),
      ]),
    captureSelectionId: topStableFaceId,
    buildEditedPart: (selectionId) =>
      dsl.part("selector-matrix-hole", [
        dsl.hole("hole-1", dsl.selectorNamed(selectionId), "-Z", 6, "throughAll"),
        dsl.extrude("base", dsl.profileRect(32, 18), 18, "body:main"),
      ]),
    assertEdited: ({ occt, result, selectionId }) => {
      assert.ok(
        result.order.indexOf("base") < result.order.indexOf("hole-1"),
        `expected stable face id to anchor hole ordering (order=${result.order.join(",")})`
      );
      assertBodyFaceIncrease(occt, result, selectionId, "hole-1", "body:main", "stable-id hole");
    },
  },
  {
    name: "stable face id keeps move face resolved after upstream edits",
    buildSeedPart: () =>
      dsl.part("selector-matrix-seed-move-face", [
        dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:main"),
      ]),
    captureSelectionId: topStableFaceId,
    buildEditedPart: (selectionId) =>
      dsl.part("selector-matrix-move-face", [
        dsl.moveFace(
          "move-top",
          dsl.selectorNamed("body:main"),
          dsl.selectorNamed(selectionId),
          "body:moved",
          undefined,
          { translation: [0, 0, 1], heal: true }
        ),
        dsl.extrude("base", dsl.profileRect(32, 18), 18, "body:main"),
      ]),
    assertEdited: ({ occt, result, selectionId }) => {
      assert.ok(
        result.order.indexOf("base") < result.order.indexOf("move-top"),
        `expected stable face id to anchor move-face ordering (order=${result.order.join(",")})`
      );
      assertBaseSelectionPreserved(result, selectionId, "move face");
      const finalBody = result.final.outputs.get("body:moved");
      assert.ok(finalBody, "missing move-face output body:moved");
      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(finalShape, "missing move-face shape");
      assertValidShape(occt, finalShape, "stable-id move-face solid");
    },
  },
  {
    name: "stable face id keeps draft resolved after upstream edits",
    buildSeedPart: () =>
      dsl.part("selector-matrix-seed-draft", [
        dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:base"),
      ]),
    captureSelectionId: sideStableFaceId,
    buildEditedPart: (selectionId) =>
      dsl.part("selector-matrix-draft", [
        dsl.draft(
          "draft-1",
          dsl.selectorNamed("body:base"),
          dsl.selectorNamed(selectionId),
          dsl.planeDatum("draft-neutral"),
          "+Z",
          Math.PI / 60,
          "body:main"
        ),
        dsl.datumPlane("draft-neutral", "+Z", [0, 0, 0]),
        dsl.extrude("base", dsl.profileRect(44, 24), 18, "body:base"),
      ]),
    assertEdited: ({ occt, result, selectionId }) => {
      assert.ok(
        result.order.indexOf("base") < result.order.indexOf("draft-1"),
        `expected stable face id to anchor draft ordering (order=${result.order.join(",")})`
      );
      assert.ok(
        result.order.indexOf("draft-neutral") < result.order.indexOf("draft-1"),
        `expected datum dependency before draft (order=${result.order.join(",")})`
      );
      assertBaseSelectionPreserved(result, selectionId, "draft");
      const finalBody = result.final.outputs.get("body:main");
      assert.ok(finalBody, "missing draft output body:main");
      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(finalShape, "missing draft shape");
      assertValidShape(occt, finalShape, "stable-id draft solid");
    },
  },
  {
    name: "stable face id keeps split face resolved after upstream edits",
    buildSeedPart: () =>
      dsl.part("selector-matrix-seed-split-face", [
        dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:main"),
      ]),
    captureSelectionId: topStableFaceId,
    buildEditedPart: (selectionId) =>
      dsl.part("selector-matrix-split-face", [
        dsl.splitFace(
          "split-face",
          dsl.selectorNamed(selectionId),
          dsl.selectorNamed("surface:splitter"),
          "body:split"
        ),
        dsl.plane("split-plane", 24, 16, "surface:splitter", {
          plane: dsl.planeDatum("split-datum"),
          origin: [0, 0, 9],
          deps: ["split-datum", "base"],
        }),
        dsl.datumPlane("split-datum", "+X", [0, 0, 0]),
        dsl.extrude("base", dsl.profileRect(28, 20), 18, "body:main"),
      ]),
    assertEdited: ({ occt, result, selectionId }) => {
      assert.ok(
        result.order.indexOf("base") < result.order.indexOf("split-face"),
        `expected stable face id to anchor split-face ordering (order=${result.order.join(",")})`
      );
      assert.ok(
        result.order.indexOf("split-plane") < result.order.indexOf("split-face"),
        `expected split-plane before split-face (order=${result.order.join(",")})`
      );
      assert.ok(
        result.order.indexOf("split-datum") < result.order.indexOf("split-plane"),
        `expected split-datum before split-plane (order=${result.order.join(",")})`
      );
      assertBodyFaceIncrease(
        occt,
        result,
        selectionId,
        "split-face",
        "body:split",
        "stable-id split-face",
        "body:main"
      );
    },
  },
  {
    name: "stable edge id keeps fillet resolved after upstream edits",
    buildSeedPart: () =>
      dsl.part("selector-matrix-seed-fillet", [
        dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:main"),
      ]),
    captureSelectionId: topStableEdgeId,
    buildEditedPart: (selectionId) =>
      dsl.part("selector-matrix-fillet", [
        dsl.fillet("edge-fillet", dsl.selectorNamed(selectionId), 1),
        dsl.extrude("base", dsl.profileRect(28, 16), 24, "body:main"),
      ]),
    assertEdited: ({ occt, result, selectionId }) => {
      assert.ok(
        result.order.indexOf("base") < result.order.indexOf("edge-fillet"),
        `expected stable edge id to anchor fillet ordering (order=${result.order.join(",")})`
      );
      assertBodyFaceIncrease(
        occt,
        result,
        selectionId,
        "edge-fillet",
        "body:main",
        "stable-id fillet"
      );
    },
  },
  {
    name: "stable edge id keeps chamfer resolved after upstream edits",
    buildSeedPart: () =>
      dsl.part("selector-matrix-seed-chamfer", [
        dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:main"),
      ]),
    captureSelectionId: topStableEdgeId,
    buildEditedPart: (selectionId) =>
      dsl.part("selector-matrix-chamfer", [
        dsl.chamfer("edge-chamfer", dsl.selectorNamed(selectionId), 1.25),
        dsl.extrude("base", dsl.profileRect(26, 18), 22, "body:main"),
      ]),
    assertEdited: ({ occt, result, selectionId }) => {
      assert.ok(
        result.order.indexOf("base") < result.order.indexOf("edge-chamfer"),
        `expected stable edge id to anchor chamfer ordering (order=${result.order.join(",")})`
      );
      assertBodyFaceIncrease(
        occt,
        result,
        selectionId,
        "edge-chamfer",
        "body:main",
        "stable-id chamfer"
      );
    },
  },
  {
    name: "stable boolean cut face id keeps move face resolved after upstream edits",
    buildSeedPart: () =>
      dsl.part("selector-matrix-seed-boolean-cut", [
        dsl.extrude("base", dsl.profileRect(20, 20), 12, "body:left"),
        dsl.extrude("tool-seed", dsl.profileRect(8, 8), 6, "body:tool-seed"),
        dsl.moveBody("tool-move", dsl.selectorNamed("body:tool-seed"), "body:right", [
          "tool-seed",
        ], {
          translation: [0, 0, 6],
        }),
        dsl.booleanOp(
          "subtract-1",
          "subtract",
          dsl.selectorNamed("body:left"),
          dsl.selectorNamed("body:right"),
          "body:main"
        ),
      ]),
    captureSelectionId: subtractCutBottomStableFaceId,
    buildEditedPart: (selectionId) =>
      dsl.part("selector-matrix-boolean-cut", [
        dsl.moveFace(
          "move-cut-floor",
          dsl.selectorNamed("body:main"),
          dsl.selectorNamed(selectionId),
          "body:moved",
          undefined,
          { translation: [0, 0, -1], heal: true }
        ),
        dsl.booleanOp(
          "subtract-1",
          "subtract",
          dsl.selectorNamed("body:left"),
          dsl.selectorNamed("body:right"),
          "body:main"
        ),
        dsl.moveBody("tool-move", dsl.selectorNamed("body:tool-seed"), "body:right", [
          "tool-seed",
        ], {
          translation: [0, 0, 7],
        }),
        dsl.extrude("tool-seed", dsl.profileRect(10, 6), 7, "body:tool-seed"),
        dsl.extrude("base", dsl.profileRect(28, 18), 14, "body:left"),
      ]),
    assertEdited: ({ occt, result, selectionId }) => {
      assert.ok(
        result.order.indexOf("base") < result.order.indexOf("subtract-1"),
        `expected base before subtract-1 (order=${result.order.join(",")})`
      );
      assert.ok(
        result.order.indexOf("tool-seed") < result.order.indexOf("tool-move"),
        `expected tool-seed before tool-move (order=${result.order.join(",")})`
      );
      assert.ok(
        result.order.indexOf("tool-move") < result.order.indexOf("subtract-1"),
        `expected tool-move before subtract-1 (order=${result.order.join(",")})`
      );
      assert.ok(
        result.order.indexOf("subtract-1") < result.order.indexOf("move-cut-floor"),
        `expected subtract-1 before move-cut-floor (order=${result.order.join(",")})`
      );
      assertFeatureSelectionPreserved(
        result,
        "subtract-1",
        selectionId,
        "stable-id boolean cut face"
      );
      const finalBody = result.final.outputs.get("body:moved");
      assert.ok(finalBody, "missing move-face output body:moved");
      const finalShape = finalBody.meta["shape"] as any;
      assert.ok(finalShape, "missing move-face shape");
      assertValidShape(occt, finalShape, "stable-id boolean cut move-face solid");
    },
  },
];

const tests = matrix.map((entry) => ({
  name: `occt e2e: ${entry.name}`,
  fn: async () => {
    const { occt, backend } = await getBackendContext();
    const seed = buildPart(entry.buildSeedPart(), backend);
    const selectionId = entry.captureSelectionId(seed.final.selections as SelectionRecord[]);
    assert.ok(selectionId, `missing seed stable selection for ${entry.name}`);

    const result = buildPart(entry.buildEditedPart(selectionId), backend);
    entry.assertEdited({
      occt,
      result,
      selectionId,
    });
  },
}));

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
