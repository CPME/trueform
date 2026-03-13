import assert from "node:assert/strict";
import {
  makeArcEdge,
  makeCircleEdge,
  makeEllipseEdge,
  makeLineEdge,
  type CurveEdgePrimitiveDeps,
} from "../occt/curve_edge_primitives.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(state: { calls: Array<{ name: string; args: unknown[] }> }): CurveEdgePrimitiveDeps {
  return {
    occt: {
      gp_Pnt_3: class {
        constructor(public x: number, public y: number, public z: number) {}
      },
      gp_XYZ_2: class {
        constructor(public x: number, public y: number, public z: number) {}
      },
      gp_Dir_3: class {
        constructor(public xyz: unknown) {}
      },
      gp_Ax2_3: class {
        constructor(public pnt: unknown, public dir: unknown) {}
      },
      gp_Circ_2: class {
        constructor(public ax2: unknown, public radius: number) {}
      },
      gp_Ax2_2: class {
        constructor(public pnt: unknown, public dir: unknown, public xDir: unknown) {}
      },
    },
    newOcct: (name: string, ...args: unknown[]) => {
      state.calls.push({ name, args });
      if (name === "GC_MakeArcOfCircle") {
        return { arc: true };
      }
      if (name === "Handle_Geom_Curve") {
        return { handle: true, args };
      }
      if (name === "BRepBuilderAPI_MakeEdge") {
        return {
          Shape() {
            return { kind: "edge", args };
          },
        };
      }
      return { name, args };
    },
    readShape: (builder) => builder.Shape(),
    call: (target, method) => {
      if (target?.arc && method === "Value") return { get: () => ({ kind: "curve" }) };
      throw new Error(`unexpected call ${String(method)}`);
    },
  };
}

const tests = [
  {
    name: "curve edge primitives: line, circle, and ellipse builders use injected constructors",
    fn: async () => {
      const state = { calls: [] as Array<{ name: string; args: unknown[] }> };
      const deps = makeDeps(state);

      const line = makeLineEdge(deps, [0, 0, 0], [1, 0, 0]);
      const circle = makeCircleEdge(deps, [0, 0, 0], 2, [0, 0, 1]);
      const ellipse = makeEllipseEdge(deps, [0, 0, 0], [1, 0, 0], [0, 0, 1], 4, 2);

      assert.equal(line.kind, "edge");
      assert.equal(circle.kind, "edge");
      assert.equal(ellipse.kind, "edge");
      assert.ok(state.calls.some((entry) => entry.name === "gp_Elips"));
    },
  },
  {
    name: "curve edge primitives: arc builder prefers GC arc path and falls back cleanly",
    fn: async () => {
      const state = { calls: [] as Array<{ name: string; args: unknown[] }> };
      const deps = makeDeps(state);
      const edge = makeArcEdge(deps, [0, 0, 0], [1, 1, 0], [2, 0, 0]);

      assert.equal(edge.kind, "edge");
      assert.deepEqual(
        state.calls.map((entry) => entry.name).slice(0, 3),
        ["GC_MakeArcOfCircle", "Handle_Geom_Curve", "BRepBuilderAPI_MakeEdge"]
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
