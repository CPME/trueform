import assert from "node:assert/strict";
import {
  makePipeSolid,
  makeRingFace,
  makeSweepSolid,
  makeThickSolid,
  type PipeShellPrimitiveDeps,
} from "../occt/pipe_shell_primitives.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(state: {
  built: unknown[];
  read: unknown[];
  calls: Array<{ target: unknown; methods: string[]; args: unknown[][] }>;
}): PipeShellPrimitiveDeps {
  return {
    occt: {
      BRepOffset_Mode: { BRepOffset_Skin: "skin" },
      GeomAbs_JoinType: { GeomAbs_Arc: "arc" },
      BRepBuilderAPI_TransitionMode: { BRepBuilderAPI_RoundCorner: "round" },
    },
    newOcct: (name: string, ...args: unknown[]) => {
      if (name === "BRepOffsetAPI_MakeThickSolid" && args.length === 0) {
        return {
          MakeThickSolidByJoin() {},
        };
      }
      if (name === "BRepOffsetAPI_MakePipeShell") {
        return {
          modes: [] as unknown[],
          added: [] as unknown[],
          SetMode(value: unknown) {
            this.modes.push(value);
          },
          SetTransitionMode(value: unknown) {
            this.transitionMode = value;
          },
          Add(profile: unknown) {
            this.added.push(profile);
          },
          MakeSolid() {
            this.madeSolid = true;
          },
        };
      }
      if (name === "BRepOffsetAPI_MakePipe") {
        return { kind: "pipe-fallback", args };
      }
      throw new Error(`unexpected ctor ${name}`);
    },
    tryBuild: (builder) => state.built.push(builder),
    readShape: (shape) => {
      state.read.push(shape);
      return { kind: "shape", shape };
    },
    readFace: (shape) => ({ kind: "face", shape }),
    callWithFallback: (target, methods, argSets) => {
      state.calls.push({ target, methods, args: argSets });
      const method = methods.find((name) => typeof (target as Record<string, unknown>)[name] === "function");
      if (!method) throw new Error("missing method");
      const fn = (target as Record<string, (...args: unknown[]) => unknown>)[method];
      if (!fn) throw new Error("missing method");
      return fn(...(argSets[0] ?? []));
    },
    makeProgressRange: () => ({ kind: "progress" }),
    makeShapeList: (shapes) => ({ kind: "shape-list", shapes }),
    toFace: (face) => ({ wrappedFace: face }),
    toWire: (wire) => ({ wrappedWire: wire }),
    makePnt: (x, y, z) => ({ kind: "pnt", x, y, z }),
    makeDir: (x, y, z) => ({ kind: "dir", x, y, z }),
    makeAx2WithXDir: (origin, normal, xDir) => ({ kind: "ax2", origin, normal, xDir }),
    makeCircleEdge: (center, radius, normal) => ({ kind: "circle-edge", center, radius, normal }),
    makeWireFromEdges: (edges) => ({ kind: "wire", edges }),
    makeFaceFromWire: (wire) => ({
      kind: "face-builder",
      wire,
      holes: [] as unknown[],
      Add(hole: unknown) {
        this.holes.push(hole);
      },
    }),
  };
}

const plane = {
  origin: [0, 0, 0] as [number, number, number],
  normal: [0, 0, 1] as [number, number, number],
  xDir: [1, 0, 0] as [number, number, number],
  yDir: [0, 1, 0] as [number, number, number],
};

const tests = [
  {
    name: "pipe shell primitives: thick solid prefers builder join path",
    fn: async () => {
      const state = { built: [] as unknown[], read: [] as unknown[], calls: [] as Array<{ target: unknown; methods: string[]; args: unknown[][] }> };
      const deps = makeDeps(state);

      const shape = makeThickSolid(deps, { kind: "source" }, [{ kind: "face" }], 2, 1e-6);

      assert.deepEqual(shape, { kind: "shape", shape: state.built[0] });
      assert.equal(state.calls.length, 1);
    },
  },
  {
    name: "pipe shell primitives: pipe and sweep shells use shell builders before fallback pipes",
    fn: async () => {
      const state = { built: [] as unknown[], read: [] as unknown[], calls: [] as Array<{ target: unknown; methods: string[]; args: unknown[][] }> };
      const deps = makeDeps(state);

      const pipeShape = makePipeSolid(deps, { kind: "spine" }, { kind: "profile" }, plane, { makeSolid: true });
      const sweepShape = makeSweepSolid(
        deps,
        { kind: "spine" },
        { kind: "profile" },
        { auxiliarySpine: { kind: "aux" }, makeSolid: false }
      );

      assert.equal((pipeShape as { kind: string }).kind, "shape");
      assert.equal((sweepShape as { kind: string }).kind, "shape");
      assert.equal(state.built.length, 2);
    },
  },
  {
    name: "pipe shell primitives: ring face adds inner wire hole when requested",
    fn: async () => {
      const state = { built: [] as unknown[], read: [] as unknown[], calls: [] as Array<{ target: unknown; methods: string[]; args: unknown[][] }> };
      const deps = makeDeps(state);

      const face = makeRingFace(deps, [0, 0, 0], [0, 0, 1], 5, 2) as {
        kind: string;
        shape: { holes?: unknown[] };
      };

      assert.equal(face.kind, "face");
      assert.equal(face.shape.holes?.length, 1);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
