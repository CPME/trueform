import assert from "node:assert/strict";
import type { KernelResult, KernelSelection } from "../backend.js";
import { execDeleteFace } from "../occt/face_edit_ops.js";
import type { FaceEditContext } from "../occt/operation_contexts.js";
import * as selectors from "../dsl/selectors.js";
import { runTests } from "./occt_test_utils.js";

function makeFaceEditContext(selections: KernelSelection[]): FaceEditContext {
  return {
    collectSelections: () => {
      throw new Error("collectSelections should not be reached");
    },
    collectToolFaces: () => [],
    deleteFacesBySewing: () => null,
    deleteFacesWithDefeaturing: () => null,
    isValidShape: () => true,
    makeFaceMutationSelectionLedgerPlan: () => ({}),
    makeSolidFromShells: () => null,
    makeSplitFaceSelectionLedgerPlan: () => ({}),
    normalizeSolid: (shape) => shape,
    ownerFaceSelectionsForShape: () => [],
    replaceFacesBySewing: () => null,
    replaceFacesWithReshape: () => null,
    resolveAxisSpec: () => [0, 0, 1],
    resolveOwnerKey: (selection) => String(selection.meta["ownerKey"] ?? ""),
    resolveOwnerShape: (selection) => selection.meta["owner"] as object,
    shapeHasSolid: () => true,
    shapeHash: (shape) => Number((shape as { hash?: number }).hash ?? 0),
    splitByTools: (shape) => shape,
    toResolutionContext: () => ({
      selections,
      named: new Map(selections.map((selection) => [selection.id, selection])),
    }),
    transformShapeRotate: (shape) => shape,
    transformShapeScale: (shape) => shape,
    transformShapeTranslate: (shape) => shape,
    unifySameDomain: (shape) => shape,
    uniqueFaceShapes: (items) => items.map((item) => item.meta["shape"] as object),
  };
}

const tests = [
  {
    name: "face edit module: delete face rejects targets from a different owner",
    fn: async () => {
      const sourceOwner = { hash: 1 };
      const otherOwner = { hash: 2 };
      const selections: KernelSelection[] = [
        {
          id: "body:main",
          kind: "solid",
          meta: { shape: sourceOwner, owner: sourceOwner, ownerKey: "body:main" },
        },
        {
          id: "face:foreign",
          kind: "face",
          meta: { shape: { hash: 10 }, owner: otherOwner, ownerKey: "body:other" },
        },
      ];
      const ctx = makeFaceEditContext(selections);
      const upstream: KernelResult = { outputs: new Map(), selections };

      assert.throws(
        () =>
          execDeleteFace(
            ctx,
            {
              kind: "feature.delete.face",
              id: "delete-1",
              source: selectors.selectorNamed("body:main"),
              faces: selectors.selectorNamed("face:foreign"),
              result: "body:result",
            },
            upstream
          ),
        /must belong to source solid/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
