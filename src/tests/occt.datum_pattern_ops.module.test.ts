import assert from "node:assert/strict";
import type { KernelResult } from "../backend.js";
import type { DatumAxis, DatumFrame, DatumPlane, Hole } from "../ir.js";
import type { ResolvedProfile } from "../occt/profile_resolution.js";
import {
  basisFromNormal,
  execDatumAxis,
  execDatumFrame,
  execDatumPlane,
  patternCenters,
  resolveAxisSpec,
  resolveExtrudeAxis,
  resolveThinFeatureAxisSpan,
} from "../occt/datum_pattern_ops.js";
import type { DatumPatternDeps } from "../occt/datum_pattern_ops.js";
import { runTests } from "./occt_test_utils.js";

const deps: DatumPatternDeps = {
  datumKey: (id: string) => `datum:${id}`,
  patternKey: (id: string) => `pattern:${id}`,
  addVec: (a: [number, number, number], b: [number, number, number]) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as [number, number, number],
  subVec: (a: [number, number, number], b: [number, number, number]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as [number, number, number],
  scaleVec: (v: [number, number, number], s: number) => [v[0] * s, v[1] * s, v[2] * s] as [number, number, number],
  planeBasisFromFace: () => ({
    origin: [1, 2, 3] as [number, number, number],
    xDir: [1, 0, 0] as [number, number, number],
    yDir: [0, 1, 0] as [number, number, number],
    normal: [0, 0, 1] as [number, number, number],
  }),
  axisBounds: (_axis: [number, number, number], bounds: { min: [number, number, number]; max: [number, number, number] }) => ({ min: bounds.min[2], max: bounds.max[2] }),
  shapeBounds: (shape: unknown) => (shape as { bounds: { min: [number, number, number]; max: [number, number, number] } }).bounds,
};

const tests = [
  {
    name: "datum pattern ops: datum plane/axis/frame execution publishes expected datum metadata",
    fn: async () => {
      const upstream: KernelResult = {
        outputs: new Map([
          [
            "datum:axis-1",
            {
              id: "axis-1:datum",
              kind: "datum",
              meta: { type: "axis", direction: [0, 0, 1] },
            },
          ],
        ]),
        selections: [],
      };
      const plane = execDatumPlane(
        deps,
        {
          kind: "datum.plane",
          id: "plane-1",
          normal: { kind: "axis.datum", ref: "axis-1" },
          origin: [0, 0, 0],
        } satisfies DatumPlane,
        upstream,
        (axis, state, label) => resolveAxisSpec(deps, axis, state, label)
      );
      const axis = execDatumAxis(
        deps,
        {
          kind: "datum.axis",
          id: "axis-2",
          direction: "+X",
          origin: [0, 0, 0],
        } satisfies DatumAxis,
        upstream,
        (spec, state, label) => resolveAxisSpec(deps, spec, state, label)
      );
      const frame = execDatumFrame(
        deps,
        {
          kind: "datum.frame",
          id: "frame-1",
          on: { kind: "selector.named", name: "face:top" },
        } satisfies DatumFrame,
        {
          outputs: new Map(),
          selections: [],
        },
        () => ({ id: "face:top", kind: "face", meta: { shape: { tag: "face" } } } as any)
      );

      assert.equal(plane.outputs.get("datum:plane-1")?.kind, "datum");
      assert.equal((axis.outputs.get("datum:axis-2")?.meta["direction"] as [number, number, number])[0], 1);
      assert.equal(frame.outputs.get("datum:frame-1")?.meta["type"], "frame");
    },
  },
  {
    name: "datum pattern ops: axis resolution, basis derivation, and extrude-axis sketch normals are stable",
    fn: async () => {
      const upstream: KernelResult = {
        outputs: new Map([
          [
            "datum:axis-1",
            {
              id: "axis-1:datum",
              kind: "datum",
              meta: { type: "axis", direction: [0, 1, 0] },
            },
          ],
        ]),
        selections: [],
      };
      assert.deepEqual(resolveAxisSpec(deps, { kind: "axis.datum", ref: "axis-1" }, upstream, "axis"), [0, 1, 0]);
      assert.deepEqual(
        basisFromNormal(deps, [0, 0, 1], undefined, [0, 0, 0]),
        { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] }
      );
      const profile: ResolvedProfile = {
        profile: { kind: "profile.sketch", loop: [], open: false },
        face: { tag: "face" },
      } as any;
      assert.deepEqual(resolveExtrudeAxis(deps, { kind: "axis.sketch.normal" }, profile, upstream), [0, 0, 1]);
    },
  },
  {
    name: "datum pattern ops: pattern centers and thin-feature axis spans derive deterministic geometry",
    fn: async () => {
      const upstream: KernelResult = {
        outputs: new Map([
          [
            "pattern:pat-1",
            {
              id: "pat-1:pattern",
              kind: "pattern",
              meta: {
                type: "pattern.linear",
                origin: [0, 0, 0],
                xDir: [1, 0, 0],
                yDir: [0, 1, 0],
                normal: [0, 0, 1],
                spacing: [10, 5],
                count: [2, 2],
              },
            },
          ],
          [
            "body:solid",
            {
              id: "body:solid",
              kind: "solid",
              meta: { shape: { bounds: { min: [0, 0, -2], max: [0, 0, 6] } } },
            },
          ],
        ]),
        selections: [],
      };

      assert.deepEqual(
        patternCenters(
          deps,
          "pat-1",
          [1, 2],
          { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] },
          upstream
        ),
        [
          [1, 2, 0],
          [1, 7, 0],
          [11, 2, 0],
          [11, 7, 0],
        ]
      );
      assert.deepEqual(resolveThinFeatureAxisSpan(deps, [0, 0, 1], [0, 0, 0], 10, upstream), {
        low: -2,
        high: 6,
      });
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
