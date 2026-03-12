import assert from "node:assert/strict";
import type { KernelResult, KernelSelection } from "../backend.js";
import type { SweepContext } from "../occt/operation_contexts.js";
import { execSweep } from "../occt/sweep_ops.js";
import { runTests } from "./occt_test_utils.js";

const profileRef = { kind: "profile.ref" as const, name: "profile:seed" };
const path = {
  kind: "path.polyline" as const,
  points: [
    [0, 0, 0] as [number, number, number],
    [0, 0, 10] as [number, number, number],
  ],
};

function makeSweepContext(state: {
  pipeCalls: Array<{ spine: unknown; profile: unknown; frameOrOpts?: unknown; maybeOpts?: unknown }>;
  selections: Array<{ ownerKey: string; rootKind?: "solid" | "face" }>;
}): SweepContext {
  return {
    buildPathWire: () => ({ tag: "spine" }),
    buildProfileFace: () => ({ tag: "face" }),
    buildProfileWire: () => ({ wire: { tag: "wire" }, closed: true }),
    collectSelections: (_shape, _featureId, ownerKey, _tags, opts) => {
      state.selections.push({ ownerKey, rootKind: opts?.rootKind });
      return [{ id: `${ownerKey}:${opts?.rootKind ?? "solid"}`, kind: "solid", meta: {} }];
    },
    makePipeSolid: (spine, profile, frameOrOpts, maybeOpts) => {
      state.pipeCalls.push({ spine, profile, frameOrOpts, maybeOpts });
      return { tag: `pipe:${state.pipeCalls.length}` };
    },
    resolvePlaneBasis: () => ({
      origin: [0, 0, 0],
      normal: [0, 0, 1],
      xDir: [1, 0, 0],
      yDir: [0, 1, 0],
    }),
    resolveProfile: () => ({ profile: { kind: "profile.circle", radius: 4 } }),
  };
}

const tests = [
  {
    name: "sweep module: closed profile defaults to solid sweep",
    fn: async () => {
      const state = {
        pipeCalls: [] as Array<{
          spine: unknown;
          profile: unknown;
          frameOrOpts?: unknown;
          maybeOpts?: unknown;
        }>,
        selections: [] as Array<{ ownerKey: string; rootKind?: "solid" | "face" }>,
      };
      const ctx = makeSweepContext(state);
      const upstream: KernelResult = { outputs: new Map(), selections: [] };
      const resolve = ((_selector: unknown, _upstream: KernelResult) => {
        throw new Error("unexpected selector resolution");
      }) as (selector: unknown, upstream: KernelResult) => KernelSelection;

      const result = execSweep(
        ctx,
        {
          kind: "feature.sweep",
          id: "sweep-1",
          profile: profileRef,
          path,
          result: "body:main",
        },
        upstream,
        resolve
      );

      assert.equal(state.pipeCalls.length, 1);
      assert.deepEqual(state.pipeCalls[0], {
        spine: { tag: "spine" },
        profile: { tag: "face" },
        frameOrOpts: { makeSolid: true, frenet: undefined },
        maybeOpts: undefined,
      });
      assert.equal(result.outputs.get("body:main")?.kind, "solid");
      assert.deepEqual(state.selections, [{ ownerKey: "body:main", rootKind: "solid" }]);
    },
  },
  {
    name: "sweep module: surface mode uses wire profile and face-root selections",
    fn: async () => {
      const state = {
        pipeCalls: [] as Array<{
          spine: unknown;
          profile: unknown;
          frameOrOpts?: unknown;
          maybeOpts?: unknown;
        }>,
        selections: [] as Array<{ ownerKey: string; rootKind?: "solid" | "face" }>,
      };
      const ctx = {
        ...makeSweepContext(state),
        buildProfileWire: () => ({ wire: { tag: "wire" }, closed: false }),
      } satisfies SweepContext;
      const upstream: KernelResult = { outputs: new Map(), selections: [] };
      const resolve = ((_selector: unknown, _upstream: KernelResult) => {
        throw new Error("unexpected selector resolution");
      }) as (selector: unknown, upstream: KernelResult) => KernelSelection;

      const result = execSweep(
        ctx,
        {
          kind: "feature.sweep",
          id: "sweep-1",
          profile: profileRef,
          path,
          result: "surface:main",
          mode: "surface",
          orientation: "frenet",
        },
        upstream,
        resolve
      );

      assert.equal(state.pipeCalls.length, 1);
      assert.deepEqual(state.pipeCalls[0], {
        spine: { tag: "spine" },
        profile: { tag: "wire" },
        frameOrOpts: { makeSolid: false, frenet: true },
        maybeOpts: undefined,
      });
      assert.equal(result.outputs.get("surface:main")?.kind, "surface");
      assert.deepEqual(state.selections, [{ ownerKey: "surface:main", rootKind: "face" }]);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
