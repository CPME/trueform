import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countFaces,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

function pointToArray(pnt: any): [number, number, number] {
  if (typeof pnt.X === "function") {
    return [pnt.X(), pnt.Y(), pnt.Z()];
  }
  if (typeof pnt.x === "function") {
    return [pnt.x(), pnt.y(), pnt.z()];
  }
  if (typeof pnt.Coord === "function") {
    const out = { value: [] as number[] };
    pnt.Coord(out);
    const coords = out.value;
    return [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0];
  }
  throw new Error("Unsupported point type");
}

function bounds(occt: any, shape: any) {
  const BoxCtor = occt.Bnd_Box_1 ?? occt.Bnd_Box;
  if (!BoxCtor || !occt.BRepBndLib?.Add) {
    throw new Error("Bnd_Box not available");
  }
  const box = new BoxCtor();
  occt.BRepBndLib.Add(shape, box, true);
  const min = pointToArray(box.CornerMin());
  const max = pointToArray(box.CornerMax());
  return { min, max };
}

const tests = [
  {
    name: "occt e2e: extrude rectangle produces solid output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("plate", [
        dsl.extrude(
          "base-extrude",
          dsl.profileRect(80, 40),
          8,
          "body:main"
        ),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      assert.equal(result.partId, "plate");
      assert.deepEqual(result.order, ["base-extrude"]);

      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      const isNull = typeof shape.IsNull === "function" ? shape.IsNull() : false;
      assert.equal(isNull, false, "expected non-null OCCT shape");
      assertValidShape(occt, shape, "extrude solid");

      const faceCount = countFaces(occt, shape);
      assert.ok(faceCount >= 5, `expected at least 5 faces, got ${faceCount}`);
    },
  },
  {
    name: "occt e2e: extrude along axis vector",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("extrude-axis", [
        dsl.extrude(
          "axis-extrude",
          dsl.profileRect(10, 12),
          25,
          "body:main",
          [],
          { axis: dsl.axisVector([1, 0, 0]) }
        ),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "axis extrude solid");

      const { min, max } = bounds(occt, shape);
      const extentX = max[0] - min[0];
      assert.ok(extentX > 20, `expected X extent ~25, got ${extentX}`);
    },
  },
  {
    name: "occt e2e: extrude along sketch normal",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const datum = dsl.datumPlane("datum-plane", dsl.axisVector([1, 0, 0]));
      const sketch = dsl.sketch2d(
        "sketch-plane",
        [
          {
            name: "profile:loop",
            profile: dsl.profileSketchLoop([
              "line-1",
              "line-2",
              "line-3",
              "line-4",
            ]),
          },
        ],
        {
          plane: dsl.planeDatum("datum-plane"),
          entities: [
            dsl.sketchLine("line-1", [0, 0], [10, 0]),
            dsl.sketchLine("line-2", [10, 0], [10, 20]),
            dsl.sketchLine("line-3", [10, 20], [0, 20]),
            dsl.sketchLine("line-4", [0, 20], [0, 0]),
          ],
        }
      );
      const extrude = dsl.extrude(
        "normal-extrude",
        dsl.profileRef("profile:loop"),
        8,
        "body:main",
        ["sketch-plane"],
        { axis: dsl.axisSketchNormal() }
      );
      const part = dsl.part("extrude-normal", [datum, sketch, extrude]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "sketch normal extrude");

      const { min, max } = bounds(occt, shape);
      const extentX = max[0] - min[0];
      assert.ok(extentX > 6, `expected X extent ~8, got ${extentX}`);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
