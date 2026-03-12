import assert from "node:assert/strict";
import type { KernelResult } from "../backend.js";
import type { ThinProfileContext } from "../occt/operation_contexts.js";
import { execRib } from "../occt/thin_profile_ops.js";
import { runTests } from "./occt_test_utils.js";

const ribProfileRef = { kind: "profile.ref" as const, name: "profile:rib" };

function makeThinProfileContext(state: {
  selections: string[];
  translated: unknown[];
}): ThinProfileContext {
  return {
    addVec: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    buildProfileWire: () => ({ wire: { tag: "wire" }, closed: false }),
    collectEdgesFromShape: () => [{ tag: "edge" }],
    collectSelections: (_shape, _featureId, ownerKey) => {
      state.selections.push(ownerKey);
      return [{ id: `${ownerKey}:solid`, kind: "solid", meta: {} }];
    },
    edgeEndpoints: () => ({ start: [0, 0, 0], end: [10, 0, 0] }),
    isValidShape: () => true,
    makeFaceFromWire: (wire) => ({ tag: "face-builder", wire }),
    makePolygonWire: (points) => ({ tag: "section-wire", points }),
    makePrism: (face, vec) => ({ tag: "prism-builder", face, vec }),
    makeSolidFromShells: () => ({ tag: "stitched-solid" }),
    makeVec: (x, y, z) => ({ x, y, z }),
    normalizeSolid: (shape) => ({ tag: "normalized", shape }),
    readShape: (shape) => shape,
    resolveExtrudeAxis: () => [0, 0, 1],
    resolveProfile: () => ({
      profile: { kind: "profile.sketch", loop: ["l1"], open: true },
      wire: { tag: "wire" },
      wireClosed: false,
      planeNormal: [0, 0, 1],
    }),
    resolveThinFeatureAxisSpan: () => ({ low: -1, high: 7 }),
    scaleVec: (v, s) => [v[0] * s, v[1] * s, v[2] * s],
    shapeHasSolid: (shape) => (shape as { tag?: string }).tag === "normalized",
    subVec: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    transformShapeTranslate: (shape, delta) => {
      const translated = { tag: "translated", shape, delta };
      state.translated.push(translated);
      return translated;
    },
  };
}

const tests = [
  {
    name: "thin profile module: rib builds a prism from an open sketch section",
    fn: async () => {
      const state = { selections: [] as string[], translated: [] as unknown[] };
      const ctx = makeThinProfileContext(state);
      const upstream: KernelResult = { outputs: new Map(), selections: [] };

      const result = execRib(
        ctx,
        {
          kind: "feature.rib",
          id: "rib-1",
          profile: ribProfileRef,
          thickness: 2,
          depth: 8,
          result: "body:rib",
          side: "symmetric",
        },
        upstream
      );

      assert.equal(state.translated.length, 1);
      const shape = result.outputs.get("body:rib")?.meta["shape"] as {
        tag: string;
        shape: {
          tag: string;
          face: { tag: string; delta: [number, number, number] };
          vec: { x: number; y: number; z: number };
        };
      };
      assert.equal(shape?.tag, "normalized");
      assert.equal(shape?.shape.tag, "prism-builder");
      assert.equal(shape?.shape.face.tag, "translated");
      assert.deepEqual(shape?.shape.face.delta, [-0, -0, -1]);
      assert.deepEqual(shape?.shape.vec, { x: 0, y: 0, z: 8 });
      assert.deepEqual(state.selections, ["body:rib"]);
    },
  },
  {
    name: "thin profile module: rib rejects closed sketch profiles",
    fn: async () => {
      const ctx = {
        ...makeThinProfileContext({ selections: [], translated: [] }),
        resolveProfile: () => ({
          profile: { kind: "profile.sketch", loop: ["l1"] },
          wire: { tag: "wire" },
          wireClosed: true,
        }),
        buildProfileWire: () => ({ wire: { tag: "wire" }, closed: true }),
      } satisfies ThinProfileContext;
      const upstream: KernelResult = { outputs: new Map(), selections: [] };

      assert.throws(
        () =>
          execRib(
            ctx,
            {
              kind: "feature.rib",
              id: "rib-1",
              profile: ribProfileRef,
              thickness: 2,
              depth: 8,
              result: "body:rib",
            },
            upstream
          ),
        /requires an open sketch profile/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
