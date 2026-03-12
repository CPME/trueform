import assert from "node:assert/strict";
import type { ExecuteInput, KernelResult, KernelSelection } from "../backend.js";
import { execThicken } from "../occt/thicken_ops.js";
import type { ThickenContext } from "../occt/operation_contexts.js";
import * as selectors from "../dsl/selectors.js";
import { runTests } from "./occt_test_utils.js";

function makePlanarSelection(): KernelSelection {
  return {
    id: "face:seed",
    kind: "face",
    meta: {
      shape: { tag: "face" },
      planar: true,
      normalVec: [0, 0, 1],
    },
  };
}

function makeThickenContext(selection: KernelSelection): ThickenContext {
  return {
    collectSelections: (_shape, _featureId, ownerKey) => [
      {
        id: `${ownerKey}:solid`,
        kind: "solid",
        meta: { ownerKey },
      },
    ],
    cylinderFromFace: () => null,
    cylinderVExtents: () => null,
    faceProperties: () => ({
      area: 10,
      center: [0, 0, 0],
      planar: true,
      normalVec: [0, 0, 1],
      surfaceType: "plane",
    }),
    firstFace: () => null,
    isValidShape: () => true,
    makeBoolean: () => ({ tag: "cut" }),
    makeCylinder: () => ({ tag: "cylinder" }),
    makePrism: (_face, vec) => ({ tag: "prism", vec }),
    makeSolidFromShells: () => null,
    makeThickSolid: () => ({ tag: "thick" }),
    makeVec: (x, y, z) => ({ x, y, z }),
    normalizeSolid: (shape) => shape,
    planeBasisFromFace: () => ({ origin: [0, 0, 0], normal: [0, 0, 1], xDir: [1, 0, 0], yDir: [0, 1, 0] }),
    readShape: (shape) => shape,
    resolve: (_selector, _upstream) => selection,
    scaleVec: (v, s) => [v[0] * s, v[1] * s, v[2] * s],
    sewShapeFaces: () => null,
    shapeHasSolid: () => true,
    addVec: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  };
}

const tests = [
  {
    name: "thicken module: planar face uses prism path and publishes solid",
    fn: async () => {
      const selection = makePlanarSelection();
      const ctx = makeThickenContext(selection);
      const upstream: KernelResult = { outputs: new Map(), selections: [selection] };
      const resolve: ExecuteInput["resolve"] = () => selection;

      const result = execThicken(
        ctx,
        {
          kind: "feature.thicken",
          id: "thicken-1",
          surface: selectors.selectorNamed("face:seed"),
          thickness: 5,
          result: "body:thick",
        },
        upstream,
        resolve
      );

      const output = result.outputs.get("body:thick");
      assert.ok(output, "missing thicken output");
      assert.equal((output?.meta["shape"] as { tag?: string }).tag, "prism");
      assert.equal(result.selections[0]?.id, "body:thick:solid");
    },
  },
  {
    name: "thicken module: rejects non-face targets",
    fn: async () => {
      const selection: KernelSelection = {
        id: "edge:seed",
        kind: "edge",
        meta: { shape: { tag: "edge" } },
      };
      const ctx = makeThickenContext(makePlanarSelection());
      const upstream: KernelResult = { outputs: new Map(), selections: [selection] };
      const resolve: ExecuteInput["resolve"] = () => selection;

      assert.throws(
        () =>
          execThicken(
            ctx,
            {
              kind: "feature.thicken",
              id: "thicken-1",
              surface: selectors.selectorNamed("edge:seed"),
              thickness: 5,
              result: "body:thick",
            },
            upstream,
            resolve
          ),
        /must resolve to a face or surface/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
