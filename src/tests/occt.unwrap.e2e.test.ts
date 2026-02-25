import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countFaces,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

function countCoincidentVerticesAcrossFaces(occt: any, shape: any): number {
  const counts = new Map<string, number>();
  const faceExplorer = new occt.TopExp_Explorer_1();
  faceExplorer.Init(
    shape,
    occt.TopAbs_ShapeEnum.TopAbs_FACE,
    occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  for (; faceExplorer.More(); faceExplorer.Next()) {
    const face = faceExplorer.Current();
    const vertexKeys = new Set<string>();
    const vertexExplorer = new occt.TopExp_Explorer_1();
    vertexExplorer.Init(
      face,
      occt.TopAbs_ShapeEnum.TopAbs_VERTEX,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    for (; vertexExplorer.More(); vertexExplorer.Next()) {
      const rawVertex = vertexExplorer.Current();
      try {
        const vertex = occt.TopoDS.Vertex_1(rawVertex);
        const point = occt.BRep_Tool.Pnt(vertex);
        const key = [
          Math.round(point.X() * 1e5),
          Math.round(point.Y() * 1e5),
          Math.round(point.Z() * 1e5),
        ].join(":");
        vertexKeys.add(key);
      } catch {
        // Skip vertices that fail coordinate extraction.
      }
    }
    for (const key of vertexKeys) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let coincident = 0;
  for (const occurrences of counts.values()) {
    if (occurrences >= 2) coincident += 1;
  }
  return coincident;
}

const tests = [
  {
    name: "occt e2e: unwrap flattens a planar face onto the XY plane",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const rect = dsl.sketchRectCorner("rect-1", [0, 0], 40, 20);
      const sketch = dsl.sketch2d(
        "sketch-face",
        [{ name: "profile:rect", profile: dsl.profileSketchLoop(["rect-1"]) }],
        { entities: [rect] }
      );
      const part = dsl.part("unwrap-planar", [
        sketch,
        dsl.surface("surface-1", dsl.profileRef("profile:rect"), "surface:main"),
        dsl.unwrap(
          "unwrap-1",
          dsl.selectorNamed("surface:main"),
          "surface:flat",
          ["surface-1"]
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:flat");
      assert.ok(output, "missing unwrap output");
      assert.equal(output.kind, "face");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      const unwrapMeta = output.meta["unwrap"] as
        | { kind?: string; sourceArea?: number; flatArea?: number }
        | undefined;
      assert.equal(unwrapMeta?.kind, "planar");
      assert.equal(typeof unwrapMeta?.sourceArea, "number");
      assert.equal(typeof unwrapMeta?.flatArea, "number");
      assertValidShape(occt, shape, "unwrap face");
      assert.equal(countSolids(occt, shape), 0);
      assert.ok(countFaces(occt, shape) >= 1, "expected face output");

      const sourceFace = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "surface-1"
      );
      const unwrappedFaces = result.final.selections.filter(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["ownerKey"] === "surface:flat" &&
          selection.meta["createdBy"] === "unwrap-1"
      );
      assert.ok(sourceFace, "missing source face metadata");
      assert.ok(unwrappedFaces.length >= 1, "missing unwrapped face metadata");
      const sourceArea = sourceFace?.meta["area"];
      const unwrappedArea = unwrappedFaces[0]?.meta["area"];
      assert.equal(typeof sourceArea, "number");
      assert.equal(typeof unwrappedArea, "number");
      assert.ok(
        Math.abs((unwrappedArea as number) - (sourceArea as number)) < 1e-6,
        "unwrap should preserve planar face area"
      );
      for (const face of unwrappedFaces) {
        const center = face.meta["center"];
        assert.ok(Array.isArray(center) && center.length === 3, "missing face center");
        assert.ok(
          Math.abs((center as number[])[2] ?? 0) < 1e-6,
          "unwrapped face should lie on z=0 plane"
        );
      }
    },
  },
  {
    name: "occt e2e: unwrap extracts and flattens thin planar solids",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("unwrap-solid-planar", [
        dsl.extrude("base", dsl.profileRect(80, 50), 4, "body:main"),
        dsl.unwrap("unwrap-1", dsl.selectorNamed("body:main"), "surface:flat", [
          "base",
        ]),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:flat");
      assert.ok(output, "missing unwrap output");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "unwrap solid planar");
      assert.equal(countSolids(occt, shape), 0);
      assert.ok(countFaces(occt, shape) >= 1, "expected face output");

      const unwrapMeta = output.meta["unwrap"] as
        | {
            kind?: string;
            sheetExtraction?: { method?: string; thickness?: number };
          }
        | undefined;
      assert.equal(unwrapMeta?.kind, "planar");
      assert.equal(unwrapMeta?.sheetExtraction?.method, "pairedPlanarFaces");
      assert.ok(
        Math.abs((unwrapMeta?.sheetExtraction?.thickness ?? 0) - 4) < 1e-6,
        "expected extracted solid thickness to match source depth"
      );
    },
  },
  {
    name: "occt e2e: unwrap flattens planar polyhedral solids (cube-like net)",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const side = 20;
      const part = dsl.part("unwrap-solid-cube", [
        dsl.extrude("base", dsl.profileRect(side, side), side, "body:main"),
        dsl.unwrap("unwrap-1", dsl.selectorNamed("body:main"), "surface:flat", [
          "base",
        ]),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:flat");
      assert.ok(output, "missing unwrap output");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "unwrap cube solid");
      assert.equal(countSolids(occt, shape), 0);
      assert.equal(countFaces(occt, shape), 6, "cube unwrap should emit 6 planar faces");

      const unwrapMeta = output.meta["unwrap"] as
        | {
            kind?: string;
            faceCount?: number;
            solidExtraction?: { method?: string };
            faces?: Array<{ solidExtraction?: { method?: string } }>;
          }
        | undefined;
      assert.equal(unwrapMeta?.kind, "multi");
      assert.equal(unwrapMeta?.faceCount, 6);
      assert.equal(unwrapMeta?.solidExtraction?.method, "axisAlignedBoxNet");

      const unwrappedFaces = result.final.selections.filter(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["ownerKey"] === "surface:flat" &&
          selection.meta["createdBy"] === "unwrap-1"
      );
      const areaSum = unwrappedFaces.reduce((sum, face) => {
        const area = face.meta["area"];
        return sum + (typeof area === "number" ? area : 0);
      }, 0);
      assert.ok(
        Math.abs(areaSum - 6 * side * side) < 1e-3,
        "cube unwrap should preserve full surface area"
      );
      const sharedVertices = countCoincidentVerticesAcrossFaces(occt, shape);
      assert.ok(
        sharedVertices >= 4,
        "cube unwrap should place multiple faces with shared seam vertices"
      );
    },
  },
  {
    name: "occt e2e: unwrap flattens full solid cylinders with cap faces",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const radius = 10;
      const height = 24;
      const part = dsl.part("unwrap-solid-cylinder", [
        dsl.pipe("pipe-1", "+Z", height, radius * 2, undefined, "body:main"),
        dsl.unwrap("unwrap-1", dsl.selectorNamed("body:main"), "surface:flat", [
          "pipe-1",
        ]),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:flat");
      assert.ok(output, "missing unwrap output");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "unwrap solid cylinder");
      assert.equal(countSolids(occt, shape), 0);
      assert.ok(countFaces(occt, shape) >= 3, "expected side + two cap faces");

      const unwrapMeta = output.meta["unwrap"] as
        | {
            kind?: string;
            faceCount?: number;
            solidExtraction?: {
              method?: string;
              radius?: number;
              height?: number;
              capCount?: number;
            };
          }
        | undefined;
      assert.equal(unwrapMeta?.kind, "multi");
      assert.equal(unwrapMeta?.faceCount, 3);
      assert.equal(unwrapMeta?.solidExtraction?.method, "solidCylinderNet");
      assert.ok(
        Math.abs((unwrapMeta?.solidExtraction?.radius ?? 0) - radius) < 1e-6,
        "cylinder unwrap metadata radius mismatch"
      );
      assert.ok(
        Math.abs((unwrapMeta?.solidExtraction?.height ?? 0) - height) < 1e-6,
        "cylinder unwrap metadata height mismatch"
      );
      assert.equal(unwrapMeta?.solidExtraction?.capCount, 2);
    },
  },
  {
    name: "occt e2e: unwrap cube net layout is deterministic across rebuilds",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("unwrap-solid-cube-determinism", [
        dsl.extrude("base", dsl.profileRect(20, 20), 20, "body:main"),
        dsl.unwrap("unwrap-1", dsl.selectorNamed("body:main"), "surface:flat", [
          "base",
        ]),
      ]);

      const buildCenters = () => {
        const result = buildPart(part, backend);
        return result.final.selections
          .filter(
            (selection) =>
              selection.kind === "face" &&
              selection.meta["ownerKey"] === "surface:flat" &&
              selection.meta["createdBy"] === "unwrap-1"
          )
          .map((selection) => selection.meta["center"])
          .filter((value): value is number[] => Array.isArray(value) && value.length === 3)
          .map((center) => center.map((v) => Number(v.toFixed(6))))
          .sort((a, b) => {
            const [ax = 0, ay = 0, az = 0] = a;
            const [bx = 0, by = 0, bz = 0] = b;
            if (ax !== bx) return ax - bx;
            if (ay !== by) return ay - by;
            return az - bz;
          });
      };

      const first = buildCenters();
      const second = buildCenters();
      assert.equal(first.length, 6, "expected 6 flattened cube faces");
      assert.deepEqual(second, first, "cube unwrap should be deterministic across runs");
    },
  },
  {
    name: "occt e2e: unwrap flattens cylindrical surfaces",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const line = dsl.sketchLine("line-1", [10, 0], [10, 16]);
      const sketch = dsl.sketch2d(
        "sketch-cyl",
        [
          {
            name: "profile:open",
            profile: dsl.profileSketchLoop(["line-1"], { open: true }),
          },
        ],
        { plane: dsl.planeDatum("sketch-plane"), entities: [line] }
      );
      const part = dsl.part("unwrap-cyl", [
        dsl.datumPlane("sketch-plane", "+Y"),
        sketch,
        dsl.revolve(
          "surface-revolve",
          dsl.profileRef("profile:open"),
          "+Z",
          "full",
          "surface:cyl",
          { mode: "surface" }
        ),
        dsl.unwrap(
          "unwrap-1",
          dsl.selectorNamed("surface:cyl"),
          "surface:flat",
          ["surface-revolve"]
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:flat");
      assert.ok(output, "missing unwrap output");
      assert.equal(output.kind, "face");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      const unwrapMeta = output.meta["unwrap"] as
        | {
            kind?: string;
            radius?: number;
            angleSpan?: number;
            axialSpan?: number;
            width?: number;
            height?: number;
          }
        | undefined;
      assert.equal(unwrapMeta?.kind, "cylindrical");
      assert.equal(typeof unwrapMeta?.radius, "number");
      assert.equal(typeof unwrapMeta?.width, "number");
      assert.equal(typeof unwrapMeta?.height, "number");
      assertValidShape(occt, shape, "unwrap cylinder face");
      assert.equal(countSolids(occt, shape), 0);
      assert.ok(countFaces(occt, shape) >= 1, "expected face output");

      const unwrappedFace = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["ownerKey"] === "surface:flat" &&
          selection.meta["createdBy"] === "unwrap-1"
      );
      assert.ok(unwrappedFace, "missing unwrapped face metadata");
      const area = unwrappedFace?.meta["area"];
      assert.equal(typeof area, "number");
      const expectedArea = 2 * Math.PI * 10 * 16;
      assert.ok(
        Math.abs((area as number) - expectedArea) < 1e-2,
        "unwrap should preserve cylindrical lateral area"
      );
      assert.ok(
        Math.abs((unwrapMeta?.width as number) - 2 * Math.PI * 10) < 1e-3,
        "unwrap metadata width should match circumference"
      );
      assert.ok(
        Math.abs((unwrapMeta?.height as number) - 16) < 1e-6,
        "unwrap metadata height should match axial span"
      );
    },
  },
  {
    name: "occt e2e: unwrap supports connected multi-face developable surfaces",
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
      const part = dsl.part("unwrap-unsupported", [
        sketch,
        dsl.sweep(
          "sweep-1",
          dsl.profileRef("profile:open"),
          dsl.pathPolyline([
            [0, 0, 0],
            [0, 0, 20],
            [15, 0, 30],
          ]),
          "surface:main",
          undefined,
          { mode: "surface" }
        ),
        dsl.unwrap("unwrap-1", dsl.selectorNamed("surface:main"), "surface:flat", [
          "sweep-1",
        ]),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:flat");
      assert.ok(output, "missing unwrap output");
      const shape = output?.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "unwrap multi-face surface");
      assert.ok(countFaces(occt, shape) >= 2, "expected multiple flattened faces");
      const sharedVertices = countCoincidentVerticesAcrossFaces(occt, shape);
      assert.ok(
        sharedVertices >= 2,
        "expected connected unwrap output to keep coincident seam vertices between faces"
      );
      const unwrapMeta = output?.meta["unwrap"] as
        | { kind?: string; faceCount?: number }
        | undefined;
      assert.equal(unwrapMeta?.kind, "multi");
      assert.ok((unwrapMeta?.faceCount ?? 0) >= 2, "expected multi unwrap metadata");
    },
  },
  {
    name: "occt e2e: unwrap rejects unsupported surface classes",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("unwrap-cone", [
        dsl.loft(
          "loft-1",
          [
            dsl.profileCircle(10, [0, 0, 0]),
            dsl.profileCircle(5, [0, 0, 15]),
          ],
          "surface:unsupported",
          undefined,
          { mode: "surface" }
        ),
        dsl.unwrap(
          "unwrap-1",
          dsl.selectorNamed("surface:unsupported"),
          "surface:flat",
          ["loft-1"]
        ),
      ]);

      assert.throws(
        () => buildPart(part, backend),
        (err) =>
          err instanceof Error &&
          err.message.includes(
            "unwrap currently supports planar or cylindrical faces only"
          )
      );
    },
  },
  {
    name: "occt e2e: unwrap rejects bulky non-planar solids",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("unwrap-solid-nonsheet", [
        dsl.loft(
          "loft-1",
          [
            dsl.profileCircle(12, [0, 0, 0]),
            dsl.profileCircle(4, [0, 0, 20]),
          ],
          "body:main"
        ),
        dsl.unwrap("unwrap-1", dsl.selectorNamed("body:main"), "surface:flat", ["loft-1"]),
      ]);

      assert.throws(
        () => buildPart(part, backend),
        (err) =>
          err instanceof Error &&
          err.message.includes(
            "unwrap solid source must be thin sheet or planar polyhedron"
          )
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
