import assert from "node:assert/strict";
import {
  makeAx1,
  makeAx2,
  makeAx2WithXDir,
  makeAxis,
  makeCirc,
  makeDir,
  makePln,
  makePnt,
  makePrism,
  makeRevol,
  makeVec,
  type ShapePrimitiveDeps,
} from "../occt/shape_primitives.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(state: { ctorCalls: Array<{ name: string; args: unknown[] }> }): ShapePrimitiveDeps {
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
      gp_Vec_3: class {
        constructor(public xyz: unknown) {}
      },
      gp_Ax2_3: class {
        constructor(public pnt: unknown, public dir: unknown) {}
      },
      gp_Ax1_2: class {
        constructor(public pnt: unknown, public dir: unknown) {}
      },
      gp_Circ_2: class {
        constructor(public ax2: unknown, public radius: number) {}
      },
    },
    newOcct: (name: string, ...args: unknown[]) => {
      state.ctorCalls.push({ name, args });
      if (name === "BRepPrimAPI_MakePrism" && args.length === 4) {
        throw new Error("four-arg prism unavailable");
      }
      if (name === "BRepPrimAPI_MakeRevol" && args.length === 3) {
        throw new Error("three-arg revol unavailable");
      }
      return { name, args };
    },
  };
}

const tests = [
  {
    name: "shape primitives: build gp constructors and axis helpers through injected OCCT deps",
    fn: async () => {
      const deps = makeDeps({ ctorCalls: [] });
      const pnt = makePnt(deps, 1, 2, 3);
      const dir = makeDir(deps, 0, 0, 1);
      const vec = makeVec(deps, 4, 5, 6);
      const ax2 = makeAx2(deps, pnt, dir);
      const ax1 = makeAx1(deps, pnt, dir);
      const axis = makeAxis(deps, "+Z", [9, 8, 7]);
      const pln = makePln(deps, [0, 0, 0], [0, 0, 1]);
      const circ = makeCirc(deps, ax2, 4);

      assert.deepEqual({ x: pnt.x, y: pnt.y, z: pnt.z }, { x: 1, y: 2, z: 3 });
      assert.ok(dir.xyz);
      assert.ok(vec.xyz);
      assert.equal(ax2.pnt, pnt);
      assert.equal(ax1.dir, dir);
      assert.ok(axis);
      assert.equal(pln.name, "gp_Pln");
      assert.equal(circ.radius, 4);
    },
  },
  {
    name: "shape primitives: prism and revol helpers try fallback constructor signatures",
    fn: async () => {
      const state = { ctorCalls: [] as Array<{ name: string; args: unknown[] }> };
      const deps = makeDeps(state);

      const prism = makePrism(deps, { face: true }, { vec: true });
      const revol = makeRevol(deps, { face: true }, { axis: true }, Math.PI);

      assert.deepEqual(prism, {
        name: "BRepPrimAPI_MakePrism",
        args: [{ face: true }, { vec: true }],
      });
      assert.deepEqual(revol, {
        name: "BRepPrimAPI_MakeRevol",
        args: [{ face: true }, { axis: true }, Math.PI, true],
      });
      assert.deepEqual(
        state.ctorCalls.map((entry) => `${entry.name}:${entry.args.length}`),
        [
          "BRepPrimAPI_MakePrism:4",
          "BRepPrimAPI_MakePrism:2",
          "BRepPrimAPI_MakeRevol:3",
          "BRepPrimAPI_MakeRevol:4",
        ]
      );
    },
  },
  {
    name: "shape primitives: ax2 with xDir falls back to plain ax2 when three-arg ctor is unavailable",
    fn: async () => {
      const state = { ctorCalls: [] as Array<{ name: string; args: unknown[] }> };
      const deps = makeDeps(state);
      delete (deps.occt as Record<string, unknown>).gp_Ax2_2;

      const ax2 = makeAx2WithXDir(deps, { p: true }, { d: true }, { x: true });
      assert.equal(ax2.pnt.p, true);
      assert.equal(ax2.dir.d, true);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
