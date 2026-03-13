import assert from "node:assert/strict";
import type { Path3D } from "../ir.js";
import {
  arcMidpointFromCenter,
  buildPathWire,
  pathStartTangent,
  type PathWireBuilderDeps,
} from "../occt/path_wire_builder.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(state: { edges: unknown[]; splineCalls: number }): PathWireBuilderDeps {
  return {
    newOcct: (name: string) => {
      if (name !== "BRepBuilderAPI_MakeWire") throw new Error(`unexpected ctor ${name}`);
      return {
        edges: [] as unknown[],
        Add(edge: unknown) {
          this.edges.push(edge);
        },
        Wire() {
          return { kind: "wire", edges: this.edges.slice() };
        },
      };
    },
    addWireEdge: (builder, edge) => {
      state.edges.push(edge);
      builder.Add(edge);
      return true;
    },
    point3Numbers: (point) => [Number(point[0]), Number(point[1]), Number(point[2])],
    makeLineEdge: (start, end) => ({ kind: "line-edge", start, end }),
    makeArcEdge: (start, mid, end) => ({ kind: "arc-edge", start, mid, end }),
    makeSplineEdge3D: () => {
      state.splineCalls += 1;
      return {
        edge: { kind: "spline-edge" },
        start: [0, 0, 0],
        end: [2, 0, 0],
        closed: false,
      };
    },
    pointsClose: (a, b, tol = 1e-6) =>
      Math.abs(a[0] - b[0]) <= tol &&
      Math.abs(a[1] - b[1]) <= tol &&
      Math.abs(a[2] - b[2]) <= tol,
  };
}

const tests = [
  {
    name: "path wire builder: builds connected polyline and spline wires via injected edge helpers",
    fn: async () => {
      const polyState = { edges: [] as unknown[], splineCalls: 0 };
      const polyDeps = makeDeps(polyState);
      const polyline: Path3D = {
        kind: "path.polyline",
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
        ],
        closed: true,
      };

      const polyWire = buildPathWire(polyline, polyDeps);

      assert.deepEqual(polyWire, {
        kind: "wire",
        edges: [
          { kind: "line-edge", start: [0, 0, 0], end: [1, 0, 0] },
          { kind: "line-edge", start: [1, 0, 0], end: [1, 1, 0] },
          { kind: "line-edge", start: [1, 1, 0], end: [0, 0, 0] },
        ],
      });
      assert.equal(polyState.splineCalls, 0);

      const splineState = { edges: [] as unknown[], splineCalls: 0 };
      const splineDeps = makeDeps(splineState);
      const splinePath: Path3D = {
        kind: "path.spline",
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
      };

      const splineWire = buildPathWire(splinePath, splineDeps);

      assert.deepEqual(splineWire, {
        kind: "wire",
        edges: [{ kind: "spline-edge" }],
      });
      assert.equal(splineState.splineCalls, 1);
    },
  },
  {
    name: "path wire builder: computes directed arc midpoint and tangent from segment paths",
    fn: async () => {
      const mid = arcMidpointFromCenter([1, 0, 0], [0, 1, 0], [0, 0, 0], "ccw");
      assert.ok(Math.abs(mid[0] - Math.SQRT1_2) < 1e-6);
      assert.ok(Math.abs(mid[1] - Math.SQRT1_2) < 1e-6);
      assert.equal(mid[2], 0);

      const tangent = pathStartTangent(
        {
          kind: "path.segments",
          segments: [
            {
              kind: "path.arc",
              start: [1, 0, 0],
              end: [0, 1, 0],
              center: [0, 0, 0],
              direction: "ccw",
            },
          ],
        },
        { point3Numbers: (point) => [Number(point[0]), Number(point[1]), Number(point[2])] }
      );

      assert.deepEqual(tangent.start, [1, 0, 0]);
      assert.ok(Math.abs(tangent.tangent[0] - (Math.SQRT1_2 - 1)) < 1e-6);
      assert.ok(Math.abs(tangent.tangent[1] - Math.SQRT1_2) < 1e-6);
      assert.equal(tangent.tangent[2], 0);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
