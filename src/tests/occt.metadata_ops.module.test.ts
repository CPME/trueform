import assert from "node:assert/strict";
import { faceProperties } from "../occt/metadata_ops.js";
import { runTests } from "./occt_test_utils.js";

const planeType = { value: 7 };

function makeCtx(orientation: number) {
  return {
    occt: {
      GeomAbs_SurfaceType: {
        GeomAbs_Plane: planeType,
      },
      TopAbs_Orientation: {
        TopAbs_FORWARD: { value: 0 },
        TopAbs_REVERSED: { value: 1 },
      },
      BRepGProp: undefined,
    },
    adjacentFaces: () => [],
    buildEdgeAdjacency: () => null,
    call: (target: any, method: string) => {
      if (target?.kind === "surface" && method === "GetType") return planeType;
      if (target?.kind === "surface" && method === "Plane") return { kind: "plane" };
      if (target?.kind === "plane" && method === "Axis") return { kind: "axis" };
      if (target?.kind === "axis" && method === "Direction") return { kind: "dir" };
      throw new Error(`unexpected call ${method}`);
    },
    callNumber: () => 0,
    callWithFallback: () => {
      throw new Error("unused");
    },
    dirToArray: () => [0, 0, 1] as [number, number, number],
    edgeEndpoints: () => null,
    faceOrientationValue: () => orientation,
    newOcct: (name: string) => {
      if (name === "BRepAdaptor_Surface") return { kind: "surface" };
      if (name === "GProp_GProps") return { kind: "props" };
      throw new Error(`unexpected ctor ${name}`);
    },
    planeBasisFromFace: () => {
      throw new Error("unused");
    },
    pointToArray: () => [0, 0, 0] as [number, number, number],
    shapeBounds: () => ({ min: [0, 0, 0] as [number, number, number], max: [2, 4, 6] as [number, number, number] }),
    shapeHash: () => 0,
    shapesSame: () => false,
    toEdge: (shape: unknown) => shape,
    toFace: (shape: unknown) => shape,
  };
}

const tests = [
  {
    name: "metadata ops: planar faceProperties flips normal for reversed faces",
    fn: async () => {
      const forward = faceProperties(makeCtx(0) as any, { tag: "face" });
      const reversed = faceProperties(makeCtx(1) as any, { tag: "face" });

      assert.equal(forward.normal, "+Z");
      assert.deepEqual(forward.normalVec, [0, 0, 1]);
      assert.equal(reversed.normal, "-Z");
      assert.deepEqual(reversed.normalVec?.map((value) => Object.is(value, -0) ? 0 : value), [0, 0, -1]);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
