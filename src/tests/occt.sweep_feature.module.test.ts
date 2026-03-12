import assert from "node:assert/strict";
import { execHexTubeSweep, execPipeSweep } from "../occt/sweep_feature_ops.js";
import type { SweepFeatureContext } from "../occt/operation_contexts.js";
import { runTests } from "./occt_test_utils.js";

function makePath() {
  return {
    kind: "path.polyline" as const,
    points: [
      [0, 0, 0] as [number, number, number],
      [0, 0, 10] as [number, number, number],
    ],
  };
}

function makeSweepContext(state: {
  selections: Array<{ ownerKey: string; rootKind?: "solid" | "face" }>;
  pipeCalls: Array<{ spine: unknown; profile: unknown; frameOrOpts?: unknown; maybeOpts?: unknown }>;
  cuts: Array<{ left: unknown; right: unknown }>;
  splitCalls: Array<{ shape: unknown; tools: unknown[] }>;
  polygonCalls: Array<[number, number, number][]>;
  circleEdges: Array<{ center: [number, number, number]; radius: number; normal: [number, number, number] }>;
}): SweepFeatureContext {
  return {
    buildPathWire: () => ({ tag: "spine" }),
    collectSelections: (_shape, _featureId, ownerKey, _tags, opts) => {
      state.selections.push({ ownerKey, rootKind: opts?.rootKind });
      return [{ id: `${ownerKey}:${opts?.rootKind ?? "solid"}`, kind: "solid", meta: {} }];
    },
    countSolids: () => 1,
    isValidShape: () => true,
    makeBoolean: (_op, left, right) => {
      state.cuts.push({ left, right });
      return { tag: "cut-builder" };
    },
    makeCircleEdge: (center, radius, normal) => {
      state.circleEdges.push({ center, radius, normal });
      return { tag: "circle-edge", radius };
    },
    makeFaceFromWire: (wire) => ({
      tag: "face-builder",
      wire,
      Add(innerWire: unknown) {
        (this as { innerWire?: unknown }).innerWire = innerWire;
      },
    }),
    makePipeSolid: (spine, profile, frameOrOpts, maybeOpts) => {
      state.pipeCalls.push({ spine, profile, frameOrOpts, maybeOpts });
      return { tag: `pipe:${state.pipeCalls.length}` };
    },
    makePolygonWire: (points) => {
      state.polygonCalls.push(points);
      return { tag: `polygon:${state.polygonCalls.length}`, points };
    },
    makeRingFace: (_center, _normal, outerRadius, innerRadius) => ({
      tag: "ring-face",
      outerRadius,
      innerRadius,
    }),
    makeWireFromEdges: (edges) => ({ tag: "wire", edges }),
    normalizeSolid: (shape) => ({ tag: "normalized", shape }),
    pathStartTangent: () => ({ start: [0, 0, 0], tangent: [0, 0, 1] }),
    planeBasisFromNormal: (origin, normal) => ({
      origin,
      normal,
      xDir: [1, 0, 0],
      yDir: [0, 1, 0],
    }),
    readFace: (shape) => ({ tag: "face", shape }),
    readShape: (shape) => ({ tag: "shape", shape }),
    regularPolygonPoints: (_center, _xDir, _yDir, radius, sides) =>
      Array.from({ length: sides }, (_, index) => [radius, index, 0] as [number, number, number]),
    splitByTools: (shape, tools) => {
      state.splitCalls.push({ shape, tools });
      return { tag: "split", shape, tools };
    },
  };
}

const tests = [
  {
    name: "sweep feature module: pipe sweep surface mode uses wire sweep and face-root selections",
    fn: async () => {
      const state = {
        selections: [] as Array<{ ownerKey: string; rootKind?: "solid" | "face" }>,
        pipeCalls: [] as Array<{
          spine: unknown;
          profile: unknown;
          frameOrOpts?: unknown;
          maybeOpts?: unknown;
        }>,
        cuts: [] as Array<{ left: unknown; right: unknown }>,
        splitCalls: [] as Array<{ shape: unknown; tools: unknown[] }>,
        polygonCalls: [] as Array<[number, number, number][]>,
        circleEdges: [] as Array<{
          center: [number, number, number];
          radius: number;
          normal: [number, number, number];
        }>,
      };
      const ctx = makeSweepContext(state);

      const result = execPipeSweep(ctx, {
        kind: "feature.pipeSweep",
        id: "pipe-surface",
        path: makePath(),
        outerDiameter: 8,
        mode: "surface",
        result: "body:pipe",
      });

      assert.equal(state.circleEdges.length, 1);
      assert.equal(state.pipeCalls.length, 1);
      assert.deepEqual(state.pipeCalls[0]?.maybeOpts, {
        makeSolid: false,
        allowFallback: false,
      });
      assert.equal(result.outputs.get("body:pipe")?.kind, "surface");
      assert.deepEqual(state.selections, [{ ownerKey: "body:pipe", rootKind: "face" }]);
    },
  },
  {
    name: "sweep feature module: hollow pipe sweep cuts inner sweep before normalizing",
    fn: async () => {
      const state = {
        selections: [] as Array<{ ownerKey: string; rootKind?: "solid" | "face" }>,
        pipeCalls: [] as Array<{
          spine: unknown;
          profile: unknown;
          frameOrOpts?: unknown;
          maybeOpts?: unknown;
        }>,
        cuts: [] as Array<{ left: unknown; right: unknown }>,
        splitCalls: [] as Array<{ shape: unknown; tools: unknown[] }>,
        polygonCalls: [] as Array<[number, number, number][]>,
        circleEdges: [] as Array<{
          center: [number, number, number];
          radius: number;
          normal: [number, number, number];
        }>,
      };
      const ctx = makeSweepContext(state);

      const result = execPipeSweep(ctx, {
        kind: "feature.pipeSweep",
        id: "pipe-solid",
        path: makePath(),
        outerDiameter: 10,
        innerDiameter: 4,
        result: "body:pipe",
      });

      assert.equal(state.pipeCalls.length, 2);
      assert.equal(state.cuts.length, 1);
      assert.equal(state.splitCalls.length, 1);
      assert.equal(result.outputs.get("body:pipe")?.kind, "solid");
      assert.deepEqual(result.outputs.get("body:pipe")?.meta["shape"], {
        tag: "normalized",
        shape: {
          tag: "split",
          shape: {
            tag: "shape",
            shape: { tag: "cut-builder" },
          },
          tools: [{ tag: "pipe:1" }, { tag: "pipe:2" }],
        },
      });
      assert.deepEqual(state.selections, [{ ownerKey: "body:pipe", rootKind: "solid" }]);
    },
  },
  {
    name: "sweep feature module: hex tube sweep adds reversed inner wire before sweeping solid",
    fn: async () => {
      const state = {
        selections: [] as Array<{ ownerKey: string; rootKind?: "solid" | "face" }>,
        pipeCalls: [] as Array<{
          spine: unknown;
          profile: unknown;
          frameOrOpts?: unknown;
          maybeOpts?: unknown;
        }>,
        cuts: [] as Array<{ left: unknown; right: unknown }>,
        splitCalls: [] as Array<{ shape: unknown; tools: unknown[] }>,
        polygonCalls: [] as Array<[number, number, number][]>,
        circleEdges: [] as Array<{
          center: [number, number, number];
          radius: number;
          normal: [number, number, number];
        }>,
      };
      const ctx = makeSweepContext(state);

      const result = execHexTubeSweep(ctx, {
        kind: "feature.hexTubeSweep",
        id: "hex-solid",
        path: makePath(),
        outerAcrossFlats: 12,
        innerAcrossFlats: 6,
        result: "body:hex",
      });

      assert.equal(state.polygonCalls.length, 2);
      assert.equal(state.pipeCalls.length, 1);
      assert.equal(result.outputs.get("body:hex")?.kind, "solid");
      assert.deepEqual(result.outputs.get("body:hex")?.meta["shape"], {
        tag: "normalized",
        shape: { tag: "pipe:1" },
      });
      assert.deepEqual(state.selections, [{ ownerKey: "body:hex", rootKind: "solid" }]);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
