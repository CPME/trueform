import assert from "node:assert/strict";
import type { KernelResult } from "../backend.js";
import type { Extrude, Loft, Pipe, Plane, Revolve, Surface } from "../ir.js";
import type { ResolvedProfile } from "../occt/profile_resolution.js";
import {
  execExtrude,
  execLoft,
  execPipe,
  execPlane,
  execRevolve,
  execSurface,
  type ModelingFeatureContext,
} from "../occt/modeling_feature_ops.js";
import { runTests } from "./occt_test_utils.js";

type TestLoftBuilder = {
  kind: "loft-builder";
  isSolid: boolean;
  wires: unknown[];
  AddWire: (wire: unknown) => void;
  CheckCompatibility: (flag: boolean) => void;
};

function makeContext(state: {
  selections: Array<{ ownerKey: string; rootKind?: "solid" | "face"; hasLedgerPlan: boolean }>;
  splitCalls: Array<{ shape: unknown; tools: unknown[] }>;
}): ModelingFeatureContext {
  return {
    collectSelections: (_shape, _featureId, ownerKey, _tags, opts) => {
      state.selections.push({
        ownerKey,
        rootKind: opts?.rootKind,
        hasLedgerPlan: opts?.ledgerPlan !== undefined,
      });
      return [{ id: `${ownerKey}:selection`, kind: "solid", meta: {} }];
    },
    resolveProfile: (profileRef, _upstream) => ({ profile: profileRef as ResolvedProfile["profile"] }),
    buildProfileFace: (profile) => ({ kind: "face", profile: profile.profile.kind }),
    buildProfileWire: (profile) => ({ wire: { kind: "wire", profile: profile.profile.kind }, closed: true }),
    resolveExtrudeAxis: () => [0, 0, 1],
    makeVec: (x, y, z) => ({ kind: "vec", x, y, z }),
    makePrism: (faceOrWire, vec) => ({ kind: "prism", faceOrWire, vec }),
    readShape: (builder) => ({ kind: "shape", builder }),
    makePrismSelectionLedgerPlan: (axis, ctx) => ({
      solid: { slot: `prism:${axis.join(",")}:${String(ctx.wireSegmentSlots?.length ?? 0)}` },
    }),
    resolvePlaneBasis: () => ({
      origin: [10, 20, 30],
      xDir: [1, 0, 0],
      yDir: [0, 1, 0],
      normal: [0, 0, 1],
    }),
    scaleVec: (v, s) => [v[0] * s, v[1] * s, v[2] * s],
    addVec: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    subVec: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    makePolygonWire: (points) => ({ kind: "polygon-wire", points }),
    makeFaceFromWire: (wire) => ({ kind: "face-builder", wire }),
    makeAxis: (dir, origin) => ({ kind: "axis", dir, origin }),
    makeRevol: (faceOrWire, axis, angleRad) => ({ kind: "revol", faceOrWire, axis, angleRad }),
    tryBuild: () => {},
    makeRevolveSelectionLedgerPlan: (angleRad) => ({ solid: { slot: `revol:${angleRad}` } }),
    makeLoftBuilder: (isSolid) => ({
      kind: "loft-builder",
      isSolid,
      wires: [] as unknown[],
      AddWire(wire: unknown) {
        this.wires.push(wire);
      },
      CheckCompatibility(_flag: boolean) {},
    } satisfies TestLoftBuilder),
    addLoftWire: (builder, wire) => {
      (builder as TestLoftBuilder).AddWire(wire);
    },
    callWithFallback: (target, methods, argSets) => {
      const method = methods.find(
        (name) => typeof (target as Record<string, unknown>)[name] === "function"
      );
      if (!method) throw new Error("missing method");
      const fn = (target as Record<string, (...args: unknown[]) => unknown>)[method];
      if (!fn) throw new Error("missing method");
      return fn(...(argSets[0] ?? []));
    },
    makeCylinder: (radius, height, axis, center) => ({ kind: "cylinder", radius, height, axis, center }),
    makePipeSelectionLedgerPlan: ({ axis, length, innerRadius }) => ({
      solid: { slot: `pipe:${axis.join(",")}:${length}:${innerRadius}` },
    }),
    makeBoolean: (_op, left, right) => ({ kind: "cut", left, right }),
    splitByTools: (shape, tools) => {
      state.splitCalls.push({ shape, tools });
      return { kind: "split", shape, tools };
    },
    normalizeSolid: (shape) => ({ kind: "normalized", shape }),
  };
}

const tests = [
  {
    name: "modeling feature ops: extrude publishes solid and surface outputs with expected selection roots",
    fn: async () => {
      const state = { selections: [] as Array<{ ownerKey: string; rootKind?: "solid" | "face"; hasLedgerPlan: boolean }>, splitCalls: [] as Array<{ shape: unknown; tools: unknown[] }> };
      const ctx = makeContext(state);
      const upstream: KernelResult = { outputs: new Map(), selections: [] };

      const solidResult = execExtrude(
        ctx,
        {
          kind: "feature.extrude",
          id: "extrude-solid",
          profile: { kind: "profile.circle", radius: 2 },
          depth: 5,
          result: "body:solid",
        } satisfies Extrude,
        upstream
      );
      const surfaceResult = execExtrude(
        ctx,
        {
          kind: "feature.extrude",
          id: "extrude-surface",
          profile: { kind: "profile.circle", radius: 2 },
          depth: 3,
          mode: "surface",
          result: "surface:main",
        } satisfies Extrude,
        upstream
      );

      assert.equal(solidResult.outputs.get("body:solid")?.kind, "solid");
      assert.equal(surfaceResult.outputs.get("surface:main")?.kind, "surface");
      assert.deepEqual(state.selections, [
        { ownerKey: "body:solid", rootKind: undefined, hasLedgerPlan: true },
        { ownerKey: "surface:main", rootKind: "face", hasLedgerPlan: false },
      ]);
    },
  },
  {
    name: "modeling feature ops: plane, surface, revolve, and loft keep expected output kinds",
    fn: async () => {
      const state = { selections: [] as Array<{ ownerKey: string; rootKind?: "solid" | "face"; hasLedgerPlan: boolean }>, splitCalls: [] as Array<{ shape: unknown; tools: unknown[] }> };
      const ctx = makeContext(state);
      const upstream: KernelResult = { outputs: new Map(), selections: [] };

      const planeResult = execPlane(
        ctx,
        {
          kind: "feature.plane",
          id: "plane-1",
          width: 8,
          height: 4,
          origin: [1, 2, 3],
          result: "face:plane",
        } satisfies Plane,
        upstream,
        (() => {
          throw new Error("unexpected resolve");
        }) as never
      );
      const surfaceResult = execSurface(
        ctx,
        {
          kind: "feature.surface",
          id: "surface-1",
          profile: { kind: "profile.circle", radius: 2 },
          result: "face:surface",
        } satisfies Surface,
        upstream
      );
      const revolveResult = execRevolve(
        ctx,
        {
          kind: "feature.revolve",
          id: "revolve-1",
          profile: { kind: "profile.circle", radius: 2 },
          axis: "+Z",
          angle: Math.PI,
          result: "body:revolve",
        } satisfies Revolve,
        upstream
      );
      const loftResult = execLoft(
        ctx,
        {
          kind: "feature.loft",
          id: "loft-1",
          profiles: [
            { kind: "profile.circle", radius: 2 },
            { kind: "profile.circle", radius: 3 },
          ],
          result: "body:loft",
        } satisfies Loft,
        upstream
      );

      assert.equal(planeResult.outputs.get("face:plane")?.kind, "face");
      assert.equal(surfaceResult.outputs.get("face:surface")?.kind, "face");
      assert.equal(revolveResult.outputs.get("body:revolve")?.kind, "solid");
      assert.equal(loftResult.outputs.get("body:loft")?.kind, "solid");
      assert.deepEqual(state.selections, [
        { ownerKey: "face:plane", rootKind: "face", hasLedgerPlan: false },
        { ownerKey: "face:surface", rootKind: "face", hasLedgerPlan: false },
        { ownerKey: "body:revolve", rootKind: undefined, hasLedgerPlan: false },
        { ownerKey: "body:loft", rootKind: "solid", hasLedgerPlan: false },
      ]);
    },
  },
  {
    name: "modeling feature ops: hollow pipe cuts the inner cylinder and normalizes the result",
    fn: async () => {
      const state = { selections: [] as Array<{ ownerKey: string; rootKind?: "solid" | "face"; hasLedgerPlan: boolean }>, splitCalls: [] as Array<{ shape: unknown; tools: unknown[] }> };
      const ctx = makeContext(state);

      const result = execPipe(
        ctx,
        {
          kind: "feature.pipe",
          id: "pipe-1",
          axis: "+Z",
          length: 10,
          outerDiameter: 6,
          innerDiameter: 2,
          result: "body:pipe",
        } satisfies Pipe
      );

      assert.equal(result.outputs.get("body:pipe")?.kind, "solid");
      assert.equal(state.splitCalls.length, 1);
      assert.deepEqual(state.selections, [{ ownerKey: "body:pipe", rootKind: undefined, hasLedgerPlan: true }]);
      assert.deepEqual(result.outputs.get("body:pipe")?.meta["shape"], {
        kind: "normalized",
        shape: {
          kind: "split",
          shape: {
            kind: "shape",
            builder: {
              kind: "cut",
              left: {
                kind: "shape",
                builder: { kind: "cylinder", radius: 3, height: 10, axis: [0, 0, 1], center: [0, 0, 0] },
              },
              right: {
                kind: "shape",
                builder: { kind: "cylinder", radius: 1, height: 10, axis: [0, 0, 1], center: [0, 0, 0] },
              },
            },
          },
          tools: [
            {
              kind: "shape",
              builder: { kind: "cylinder", radius: 3, height: 10, axis: [0, 0, 1], center: [0, 0, 0] },
            },
            {
              kind: "shape",
              builder: { kind: "cylinder", radius: 1, height: 10, axis: [0, 0, 1], center: [0, 0, 0] },
            },
          ],
        },
      });
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
