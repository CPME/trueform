import assert from "node:assert/strict";
import {
  makeCircleFace,
  makeCircleWire,
  makePolygonWire,
  makeRectangleFace,
  makeRectangleWire,
  makeRegularPolygonFace,
  makeRegularPolygonWire,
  regularPolygonPoints,
  type ProfilePrimitiveDeps,
} from "../occt/profile_primitives.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(state: {
  ctorCalls: Array<{ name: string; args: unknown[] }>;
  wireAdds: number;
}): ProfilePrimitiveDeps {
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
    },
    newOcct: (name: string, ...args: unknown[]) => {
      state.ctorCalls.push({ name, args });
      if (name === "BRepBuilderAPI_MakePolygon") {
        return {
          points: [] as unknown[],
          Add(point: unknown) {
            this.points.push(point);
          },
          Close() {},
          Wire() {
            return { kind: "polygon-wire", points: this.points.slice() };
          },
        };
      }
      if (name === "BRepBuilderAPI_MakeWire") {
        return {
          edges: [] as unknown[],
          Add(edge: unknown) {
            this.edges.push(edge);
          },
          Wire() {
            return { kind: "wire", edges: this.edges.slice() };
          },
        };
      }
      if (name === "BRepBuilderAPI_MakeEdge") {
        return {
          Shape() {
            return { kind: "edge", args };
          },
        };
      }
      if (name === "BRepBuilderAPI_MakeFace") {
        return {
          Face() {
            return { kind: "face", args };
          },
        };
      }
      if (name === "gp_Pln") {
        return { kind: "plane", args };
      }
      return { kind: name, args };
    },
    point3Numbers: (point) => point as [number, number, number],
    readShape: (builder) =>
      typeof builder.Shape === "function" ? builder.Shape() : builder.shape?.(),
    makeFaceFromWire: (wire) => ({
      Face() {
        return { kind: "face", wire };
      },
    }),
    readFace: (builder) => builder.Face(),
    addWireEdge: (builder, edge) => {
      state.wireAdds += 1;
      builder.Add(edge);
      return true;
    },
  };
}

const tests = [
  {
    name: "profile primitives: rectangle and circle helpers emit wires and faces through injected deps",
    fn: async () => {
      const state = { ctorCalls: [] as Array<{ name: string; args: unknown[] }>, wireAdds: 0 };
      const deps = makeDeps(state);

      const rectWire = makeRectangleWire(deps, 10, 4, [1, 2, 0]);
      const rectFace = makeRectangleFace(deps, 10, 4, [1, 2, 0]);
      const circleWire = makeCircleWire(deps, 3, [0, 0, 0]);
      const circleFace = makeCircleFace(deps, 3, [0, 0, 0]);

      assert.equal((rectWire as { kind: string }).kind, "polygon-wire");
      assert.deepEqual(rectFace, { kind: "face", wire: rectWire });
      assert.equal((circleWire as { kind: string }).kind, "wire");
      assert.deepEqual(circleFace, { kind: "face", wire: circleWire });
      assert.ok(state.ctorCalls.some((entry) => entry.name === "BRepBuilderAPI_MakeEdge"));
    },
  },
  {
    name: "profile primitives: polygon helpers reuse generic wire builder path",
    fn: async () => {
      const state = { ctorCalls: [] as Array<{ name: string; args: unknown[] }>, wireAdds: 0 };
      const deps = makeDeps(state);
      const points = regularPolygonPoints([0, 0, 0], [1, 0, 0], [0, 1, 0], 2, 4);
      const polyWire = makePolygonWire(deps, points);
      const regWire = makeRegularPolygonWire(deps, 6, 2, [0, 0, 0], Math.PI / 6);
      const regFace = makeRegularPolygonFace(deps, 6, 2, [0, 0, 0], Math.PI / 6);

      assert.equal((polyWire as { kind: string }).kind, "wire");
      assert.equal((regWire as { kind: string }).kind, "wire");
      assert.deepEqual(regFace, { kind: "face", wire: regWire });
      assert.equal(state.wireAdds, points.length + 6 + 6);
      assert.equal(points.length, 4);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
