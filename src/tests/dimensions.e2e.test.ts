import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { evaluatePartDimensions } from "../dimensions.js";
import type { KernelResult } from "../backend.js";
import { runTests } from "./occt_test_utils.js";

function makeKernelResult(outputs: KernelResult["outputs"]): KernelResult {
  return { outputs, selections: [] };
}

function byId<T extends { id: string }>(list: T[], id: string): T {
  const hit = list.find((entry) => entry.id === id);
  if (!hit) throw new Error(`Missing entry ${id}`);
  return hit;
}

function approx(actual: number | undefined, expected: number, epsilon = 1e-9): void {
  assert.equal(typeof actual, "number");
  assert.ok(Math.abs((actual as number) - expected) <= epsilon);
}

const tests = [
  {
    name: "dimensions: evaluate distance/angle with tolerances",
    fn: async () => {
      const a = dsl.refSurface(dsl.selectorNamed("face:a"));
      const b = dsl.refSurface(dsl.selectorNamed("face:b"));
      const part = dsl.part("dimension-eval", [], {
        params: [
          dsl.paramLength("nominalDist", dsl.exprLiteral(1, "cm")),
          dsl.paramAngle("nominalAngle", dsl.exprLiteral(90, "deg")),
        ],
        constraints: [
          dsl.dimensionDistance("dist-ok", a, b, {
            nominal: dsl.exprParam("nominalDist"),
            tolerance: 0.2,
          }),
          dsl.dimensionDistance("dist-fail", a, b, { nominal: 9, tolerance: 0.5 }),
          dsl.dimensionDistance("dist-bilateral", a, b, {
            nominal: 10,
            plus: 0.2,
            minus: 0.3,
          }),
          dsl.dimensionAngle("ang-ok", a, b, {
            nominal: dsl.exprParam("nominalAngle"),
            tolerance: dsl.exprLiteral(1, "deg"),
          }),
        ],
      });
      const result = makeKernelResult(
        new Map([
          [
            "face:a",
            {
              id: "face:a",
              kind: "face",
              meta: { center: [0, 0, 0], normalVec: [1, 0, 0] },
            },
          ],
          [
            "face:b",
            {
              id: "face:b",
              kind: "face",
              meta: { center: [10, 0, 0], normalVec: [0, 1, 0] },
            },
          ],
        ])
      );

      const dimensions = evaluatePartDimensions(part, result);
      assert.equal(dimensions.length, 4);

      const distOk = byId(dimensions, "dist-ok");
      assert.equal(distOk.status, "ok");
      approx(distOk.measured, 10);

      const distFail = byId(dimensions, "dist-fail");
      assert.equal(distFail.status, "fail");
      approx(distFail.measured, 10);

      const distBilateral = byId(dimensions, "dist-bilateral");
      assert.equal(distBilateral.status, "ok");
      approx(distBilateral.measured, 10);

      const angOk = byId(dimensions, "ang-ok");
      assert.equal(angOk.status, "ok");
      approx(angOk.measured, Math.PI / 2);
    },
  },
  {
    name: "dimensions: unsupported when refs or metadata are missing",
    fn: async () => {
      const a = dsl.refSurface(dsl.selectorNamed("face:a"));
      const missingCenter = dsl.refSurface(dsl.selectorNamed("face:no-center"));
      const missingDirection = dsl.refSurface(dsl.selectorNamed("face:no-normal"));
      const missingRef = dsl.refSurface(dsl.selectorNamed("face:missing"));
      const part = dsl.part("dimension-unsupported", [], {
        constraints: [
          dsl.dimensionDistance("dist-metadata", a, missingCenter, {
            nominal: 10,
            tolerance: 0.5,
          }),
          dsl.dimensionAngle("ang-metadata", a, missingDirection, {
            nominal: dsl.exprLiteral(90, "deg"),
            tolerance: dsl.exprLiteral(1, "deg"),
          }),
          dsl.dimensionDistance("dist-ref", a, missingRef, {
            nominal: 10,
            tolerance: 0.5,
          }),
        ],
      });
      const result = makeKernelResult(
        new Map([
          [
            "face:a",
            {
              id: "face:a",
              kind: "face",
              meta: { center: [0, 0, 0], normalVec: [1, 0, 0] },
            },
          ],
          [
            "face:no-center",
            {
              id: "face:no-center",
              kind: "face",
              meta: { normalVec: [0, 1, 0] },
            },
          ],
          [
            "face:no-normal",
            {
              id: "face:no-normal",
              kind: "face",
              meta: { center: [5, 0, 0] },
            },
          ],
        ])
      );

      const dimensions = evaluatePartDimensions(part, result);
      assert.equal(dimensions.length, 3);

      const distMetadata = byId(dimensions, "dist-metadata");
      assert.equal(distMetadata.status, "unsupported");
      assert.equal(distMetadata.ok, false);
      assert.match(distMetadata.message ?? "", /center metadata/);

      const angMetadata = byId(dimensions, "ang-metadata");
      assert.equal(angMetadata.status, "unsupported");
      assert.equal(angMetadata.ok, false);
      assert.match(angMetadata.message ?? "", /direction metadata/);

      const distRef = byId(dimensions, "dist-ref");
      assert.equal(distRef.status, "unsupported");
      assert.equal(distRef.ok, false);
      assert.match(distRef.message ?? "", /Missing named output/);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
