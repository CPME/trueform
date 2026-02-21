import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countSolids,
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
  throw new Error("Unsupported point type");
}

function bounds(
  occt: any,
  shape: any
): { min: [number, number, number]; max: [number, number, number] } {
  const BoxCtor = occt.Bnd_Box_1 ?? occt.Bnd_Box;
  if (!BoxCtor || !occt.BRepBndLib?.Add) {
    throw new Error("Bnd_Box not available");
  }
  const box = new BoxCtor();
  occt.BRepBndLib.Add(shape, box, true);
  return {
    min: pointToArray(box.CornerMin()),
    max: pointToArray(box.CornerMax()),
  };
}

function approx(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}

const tests = [
  {
    name: "occt e2e: mirror creates a solid across a datum plane",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const base = dsl.extrude(
        "base",
        dsl.profileRect(12, 6, [14, 4, 0]),
        4,
        "body:base"
      );
      const plane = dsl.datumPlane("mirror-plane", "+X");
      const mirror = dsl.mirror(
        "mirror-1",
        dsl.selectorNamed("body:base"),
        dsl.planeDatum("mirror-plane"),
        "body:mirror"
      );
      const part = dsl.part("mirror-test", [base, plane, mirror]);

      const result = buildPart(part, backend);
      const baseOutput = result.final.outputs.get("body:base");
      assert.ok(baseOutput, "missing base output");
      const output = result.final.outputs.get("body:mirror");
      assert.ok(output, "missing mirror output");
      assert.equal(output.kind, "solid");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "mirror shape");
      assert.ok(countSolids(occt, shape) >= 1, "expected mirrored solid");
      const sourceShape = baseOutput.meta["shape"] as any;
      assert.ok(sourceShape, "missing source shape");
      const sourceBounds = bounds(occt, sourceShape);
      const mirroredBounds = bounds(occt, shape);

      assert.ok(sourceBounds.min[0] > 0, "source should be fully on +X side");
      assert.ok(mirroredBounds.max[0] < 0, "mirrored shape should be fully on -X side");
      assert.ok(
        approx(mirroredBounds.min[0], -sourceBounds.max[0]),
        "mirrored min X should reflect source max X across x=0"
      );
      assert.ok(
        approx(mirroredBounds.max[0], -sourceBounds.min[0]),
        "mirrored max X should reflect source min X across x=0"
      );
      assert.ok(
        approx(mirroredBounds.min[1], sourceBounds.min[1]) &&
          approx(mirroredBounds.max[1], sourceBounds.max[1]),
        "mirror across x=0 should preserve Y extents"
      );
      assert.ok(
        approx(mirroredBounds.min[2], sourceBounds.min[2]) &&
          approx(mirroredBounds.max[2], sourceBounds.max[2]),
        "mirror across x=0 should preserve Z extents"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
