import assert from "node:assert/strict";
import type { KernelResult } from "../backend.js";
import {
  buildProfileFaceWithDeps,
  buildProfileWireWithDeps,
  planeBasisFromFaceWithDeps,
  resolvePlaneBasisWithDeps,
  resolveSketchPlaneWithDeps,
  type ProfilePlaneAdapterDeps,
} from "../occt/profile_plane_adapters.js";
import type { ResolvedProfile } from "../occt/profile_resolution.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(state: {
  calls: string[];
  faceShapes?: unknown[];
}): ProfilePlaneAdapterDeps {
  return {
    datumKey: (id) => `datum:${id}`,
    occt: { GeomAbs_SurfaceType: { GeomAbs_Plane: { value: 7 } } },
    toFace: (target) => target,
    newOcct: (name, ...args) => {
      state.calls.push(`new:${name}`);
      return { name, args };
    },
    call: (target, name) => {
      state.calls.push(`call:${String(name)}`);
      if (target?.name === "BRepAdaptor_Surface" && name === "GetType") {
        return { value: 7 };
      }
      if (target?.name === "BRepAdaptor_Surface" && name === "Plane") {
        return { plane: true };
      }
      if (target?.plane && name === "Position") {
        return { position: true };
      }
      if (target?.position && name === "Location") {
        return { point: [1, 2, 3] };
      }
      if (target?.position && name === "XDirection") {
        return { dir: [1, 0, 0] };
      }
      if (target?.position && name === "YDirection") {
        return { dir: [0, 1, 0] };
      }
      if (target?.position && name === "Direction") {
        return { dir: [0, 0, 1] };
      }
      throw new Error(`unexpected call ${String(name)}`);
    },
    pointToArray: (point) => point.point as [number, number, number],
    dirToArray: (dir) => dir.dir as [number, number, number],
    makeRectangleFace: (width, height, center) => ({ kind: "face.rect", width, height, center }),
    makeCircleFace: (radius, center) => ({ kind: "face.circle", radius, center }),
    makeRegularPolygonFace: (sides, radius, center, rotation) => ({
      kind: "face.poly",
      sides,
      radius,
      center,
      rotation,
    }),
    makeRectangleWire: (width, height, center) => ({ kind: "wire.rect", width, height, center }),
    makeCircleWire: (radius, center) => ({ kind: "wire.circle", radius, center }),
    makeRegularPolygonWire: (sides, radius, center, rotation) => ({
      kind: "wire.poly",
      sides,
      radius,
      center,
      rotation,
    }),
  };
}

const tests = [
  {
    name: "profile-plane adapters: build primitive profile faces and wires through injected deps",
    fn: async () => {
      const deps = makeDeps({ calls: [] });
      const profile: ResolvedProfile = {
        profile: { kind: "profile.rectangle", width: 8, height: 3, center: [1, 2, 0] },
      };

      assert.deepEqual(buildProfileFaceWithDeps(profile, deps), {
        kind: "face.rect",
        width: 8,
        height: 3,
        center: [1, 2, 0],
      });
      assert.deepEqual(buildProfileWireWithDeps(profile, deps), {
        wire: { kind: "wire.rect", width: 8, height: 3, center: [1, 2, 0] },
        closed: true,
      });
    },
  },
  {
    name: "profile-plane adapters: resolve sketch and plane refs through datum and face helpers",
    fn: async () => {
      const state = { calls: [] as string[] };
      const deps = makeDeps(state);
      const upstream: KernelResult = {
        outputs: new Map([
          [
            "datum:fixture",
            {
              id: "datum:fixture",
              kind: "datum",
              meta: {
                type: "plane",
                origin: [5, 6, 7],
                xDir: [1, 0, 0],
                yDir: [0, 1, 0],
                normal: [0, 0, 1],
              },
            },
          ],
        ]),
        selections: [],
      };
      const resolve = ((selector: unknown) => {
        if ((selector as { kind?: string }).kind === "selector.face") {
          return { id: "face", kind: "face", meta: { shape: { tag: "face-shape" } } };
        }
        throw new Error("unexpected selector");
      }) as any;

      const sketchPlane = resolveSketchPlaneWithDeps(
        {
          kind: "feature.sketch2d",
          id: "sketch-1",
          plane: { kind: "plane.datum", ref: "fixture" },
          origin: [1, 2, 3],
          profiles: [],
        },
        upstream,
        resolve,
        deps
      );
      assert.deepEqual(sketchPlane.origin, [6, 8, 10]);

      const planeBasis = resolvePlaneBasisWithDeps(
        { kind: "selector.face", predicates: [], rank: [] },
        upstream,
        resolve,
        deps
      );
      assert.deepEqual(planeBasis, {
        origin: [1, 2, 3],
        xDir: [1, 0, 0],
        yDir: [0, 1, 0],
        normal: [0, 0, 1],
      });
      assert.ok(state.calls.includes("new:BRepAdaptor_Surface"));
    },
  },
  {
    name: "profile-plane adapters: plane basis face adapter delegates OCCT face plumbing",
    fn: async () => {
      const state = { calls: [] as string[] };
      const deps = makeDeps(state);
      const basis = planeBasisFromFaceWithDeps({ tag: "face-shape" }, deps);
      assert.deepEqual(basis.normal, [0, 0, 1]);
      assert.deepEqual(basis.origin, [1, 2, 3]);
      assert.deepEqual(state.calls.slice(0, 2), ["new:BRepAdaptor_Surface", "call:GetType"]);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
