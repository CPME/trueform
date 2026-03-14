import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countEdges,
  countFaces,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

function measureSurfaceArea(occt: any, shape: any): number {
  const props = new occt.GProp_GProps_1();
  occt.BRepGProp.SurfaceProperties_1(shape, props, true, true);
  const area = typeof props.Mass === "function" ? props.Mass() : Number.NaN;
  if (!Number.isFinite(area)) {
    throw new Error(`Expected finite surface area, got ${String(area)}`);
  }
  return area;
}

function targetSurfaceTypes(
  selections: Array<{ id: string; kind: string; meta: Record<string, unknown> }>,
  ownerKey: string
): Record<string, number> {
  const faceSelections = selections.filter(
    (selection) => selection.kind === "face" && selection.meta["ownerKey"] === ownerKey
  );
  const uniqueSelections = new Map(faceSelections.map((selection) => [selection.id, selection]));
  const counts: Record<string, number> = {};
  for (const selection of uniqueSelections.values()) {
    const surfaceType =
      typeof selection.meta["surfaceType"] === "string"
        ? (selection.meta["surfaceType"] as string)
        : "unknown";
    counts[surfaceType] = (counts[surfaceType] ?? 0) + 1;
  }
  return counts;
}

function polylineLength(points: Array<[number, number, number]>): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1] as [number, number, number];
    const end = points[index] as [number, number, number];
    length += Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  }
  return length;
}

const tests = [
  {
    name: "occt e2e: surface from closed sketch produces face output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const rect = dsl.sketchRectCorner("rect-1", [-10, -5], 20, 10);
      const sketch = dsl.sketch2d(
        "sketch-surface",
        [
          {
            name: "profile:rect",
            profile: dsl.profileSketchLoop(["rect-1"]),
          },
        ],
        { entities: [rect] }
      );
      const part = dsl.part("surface-face", [
        sketch,
        dsl.surface("surface-1", dsl.profileRef("profile:rect"), "surface:main"),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:main");
      assert.ok(output, "missing surface output");
      assert.equal(output.kind, "face");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "surface face");
      assert.equal(countSolids(occt, shape), 0);
      assert.ok(countFaces(occt, shape) >= 1, "expected surface to have faces");
    },
  },
  {
    name: "occt e2e: extrude surface from open sketch produces shell",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const line = dsl.sketchLine("line-1", [0, 0], [30, 0]);
      const sketch = dsl.sketch2d(
        "sketch-open",
        [
          {
            name: "profile:open",
            profile: dsl.profileSketchLoop(["line-1"], { open: true }),
          },
        ],
        { origin: [0, 0, 0], entities: [line] }
      );
      const part = dsl.part("extrude-surface", [
        sketch,
        dsl.extrude(
          "surface-extrude",
          dsl.profileRef("profile:open"),
          10,
          "surface:wall",
          undefined,
          { mode: "surface" }
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:wall");
      assert.ok(output, "missing surface output");
      assert.equal(output.kind, "surface");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "extrude surface");
      assert.equal(countSolids(occt, shape), 0);
      assert.equal(countFaces(occt, shape), 1, "expected one ruled face");
      assert.equal(countEdges(occt, shape), 4, "expected rectangular boundary edges");
      const area = measureSurfaceArea(occt, shape);
      assert.ok(Math.abs(area - 300) < 1e-6, `expected area 300, got ${area}`);
      assert.deepEqual(
        targetSurfaceTypes(result.final.selections as any[], "surface:wall"),
        { plane: 1 }
      );
    },
  },
  {
    name: "occt e2e: sweep surface along polyline produces surface output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const line = dsl.sketchLine("line-1", [-8, 0], [8, 0]);
      const sketch = dsl.sketch2d(
        "sketch-sweep",
        [
          {
            name: "profile:open",
            profile: dsl.profileSketchLoop(["line-1"], { open: true }),
          },
        ],
        { entities: [line] }
      );
      const pathPoints: Array<[number, number, number]> = [
        [0, 0, 0],
        [0, 0, 20],
        [15, 0, 30],
      ];
      const path = dsl.pathPolyline(pathPoints);
      const part = dsl.part("sweep-surface", [
        sketch,
        dsl.sweep(
          "sweep-1",
          dsl.profileRef("profile:open"),
          path,
          "surface:main",
          undefined,
          { mode: "surface" }
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:main");
      assert.ok(output, "missing surface output");
      assert.equal(output.kind, "surface");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "sweep surface");
      assert.equal(countSolids(occt, shape), 0);
      assert.equal(countFaces(occt, shape), 3, "expected one planar patch per path segment");
      assert.equal(countEdges(occt, shape), 13, "expected open sweep sheet boundary topology");
      const expectedArea = 16 * polylineLength(pathPoints);
      const area = measureSurfaceArea(occt, shape);
      assert.ok(
        Math.abs(area - expectedArea) < 4,
        `expected sweep area near ${expectedArea}, got ${area}`
      );
      assert.deepEqual(
        targetSurfaceTypes(result.final.selections as any[], "surface:main"),
        { plane: 3 }
      );
    },
  },
  {
    name: "occt e2e: surface fails for open profile input",
    fn: async () => {
      const { backend } = await getBackendContext();
      const line = dsl.sketchLine("line-1", [0, 0], [20, 0]);
      const sketch = dsl.sketch2d(
        "sketch-open",
        [
          {
            name: "profile:open",
            profile: dsl.profileSketchLoop(["line-1"], { open: true }),
          },
        ],
        { entities: [line] }
      );
      const part = dsl.part("surface-open-invalid", [
        sketch,
        dsl.surface("surface-1", dsl.profileRef("profile:open"), "surface:main"),
      ]);
      assert.throws(() => buildPart(part, backend), /face|wire|closed|profile/i);
    },
  },
  {
    name: "occt e2e: surface output is deterministic across repeated runs",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const rect = dsl.sketchRectCorner("rect-1", [-10, -5], 20, 10);
      const sketch = dsl.sketch2d(
        "sketch-surface",
        [
          {
            name: "profile:rect",
            profile: dsl.profileSketchLoop(["rect-1"]),
          },
        ],
        { entities: [rect] }
      );
      const part = dsl.part("surface-determinism", [
        sketch,
        dsl.surface("surface-1", dsl.profileRef("profile:rect"), "surface:main"),
      ]);
      const first = buildPart(part, backend);
      const second = buildPart(part, backend);
      const firstOut = first.final.outputs.get("surface:main");
      const secondOut = second.final.outputs.get("surface:main");
      assert.ok(firstOut, "missing first deterministic surface output");
      assert.ok(secondOut, "missing second deterministic surface output");
      const firstShape = firstOut.meta["shape"] as any;
      const secondShape = secondOut.meta["shape"] as any;
      assertValidShape(occt, firstShape, "first deterministic surface output");
      assertValidShape(occt, secondShape, "second deterministic surface output");
      assert.equal(countSolids(occt, firstShape), countSolids(occt, secondShape));
      assert.equal(countFaces(occt, firstShape), countFaces(occt, secondShape));
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
