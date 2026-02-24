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

const tests = [
  {
    name: "occt e2e: unwrap flattens a planar face onto the XY plane",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("unwrap-planar", [
        dsl.extrude("base", dsl.profileRect(40, 20), 6, "body:main"),
        dsl.unwrap(
          "unwrap-1",
          dsl.selectorFace(
            [dsl.predCreatedBy("base"), dsl.predPlanar(), dsl.predNormal("+Z")],
            [dsl.rankMaxArea()]
          ),
          "surface:flat",
          ["base"]
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
          selection.meta["createdBy"] === "base" &&
          selection.meta["normal"] === "+Z"
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
    name: "occt e2e: unwrap rejects unsupported multi-face surfaces",
    fn: async () => {
      const { backend } = await getBackendContext();
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

      assert.throws(
        () => buildPart(part, backend),
        (err) =>
          err instanceof Error &&
          err.message.includes(
            "unwrap surface source must resolve to exactly one face"
          )
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
