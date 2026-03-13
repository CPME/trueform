import assert from "node:assert/strict";
import {
  axisBounds,
  countFaces,
  cylinderReferenceXDirection,
  cylinderVExtents,
  firstFace,
  listFaces,
  makeCompoundFromShapes,
  shapeBounds,
  shapeCenter,
  surfaceUvExtents,
  type ShapeAnalysisPrimitiveDeps,
} from "../occt/shape_analysis_primitives.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(): ShapeAnalysisPrimitiveDeps {
  class Explorer {
    private items: any[] = [];
    private index = 0;

    Init(shape: { faces?: any[] }, _kind: number, _until: number) {
      this.items = shape.faces ?? [];
      this.index = 0;
    }

    More() {
      return this.index < this.items.length;
    }

    Next() {
      this.index += 1;
    }

    Current() {
      return this.items[this.index];
    }
  }

  class Box {
    min: [number, number, number] = [0, 0, 0];
    max: [number, number, number] = [0, 0, 0];

    CornerMin() {
      return this.min;
    }

    CornerMax() {
      return this.max;
    }
  }

  return {
    occt: {
      TopExp_Explorer_1: Explorer,
      TopAbs_ShapeEnum: {
        TopAbs_FACE: 1,
        TopAbs_SHAPE: 2,
      },
      BRepBndLib: {
        Add(shape: { bounds?: { min: [number, number, number]; max: [number, number, number] } }, box: Box) {
          box.min = shape.bounds?.min ?? [0, 0, 0];
          box.max = shape.bounds?.max ?? [0, 0, 0];
        },
      },
    },
    newOcct: (name: string, ...args: unknown[]) => {
      if (name === "Bnd_Box") return new Box();
      if (name === "TopoDS_Compound") return { kind: "compound", shapes: [] as unknown[] };
      if (name === "BRep_Builder") {
        return {
          MakeCompound(compound: { shapes: unknown[] }) {
            compound.shapes = [];
          },
          Add(compound: { shapes: unknown[] }, shape: unknown) {
            compound.shapes.push(shape);
          },
        };
      }
      if (name === "BRepAdaptor_Surface") {
        const face = args[0] as { wrappedFace?: Record<string, unknown> };
        const data = face?.wrappedFace ?? {};
        if (data.adaptorError) throw new Error("adaptor failed");
        return {
          FirstUParameter: () => data.u0,
          LastUParameter: () => data.u1,
          FirstVParameter: () => data.v0,
          LastVParameter: () => data.v1,
        };
      }
      throw new Error(`unexpected ctor ${name}`);
    },
    pointToArray: (point: [number, number, number]) => point,
    toFace: (face: any) => ({ wrappedFace: face, id: face?.id }),
    callWithFallback: (target, methods, argSets) => {
      const method = methods.find((name) => typeof (target as Record<string, unknown>)[name] === "function");
      if (!method) throw new Error("missing method");
      const fn = (target as Record<string, (...args: unknown[]) => unknown>)[method];
      if (!fn) throw new Error("missing method");
      return fn.call(target, ...(argSets[0] ?? []));
    },
    callNumber: (target: Record<string, (() => number) | undefined>, name: string) => {
      const fn = target[name];
      if (typeof fn !== "function") {
        throw new Error(`missing adaptor method ${name}`);
      }
      return fn();
    },
  };
}

const tests = [
  {
    name: "shape analysis primitives: bounds, faces, compounds, and centers use injected OCCT helpers",
    fn: async () => {
      const deps = makeDeps();
      const shape = {
        bounds: { min: [1, 2, 3], max: [5, 6, 7] as [number, number, number] },
        faces: [{ id: 1 }, { id: 2 }],
      };

      assert.deepEqual(shapeBounds(deps, shape), {
        min: [1, 2, 3],
        max: [5, 6, 7],
      });
      assert.deepEqual(firstFace(deps, shape), { wrappedFace: { id: 1 }, id: 1 });
      assert.deepEqual(listFaces(deps, shape), [
        { wrappedFace: { id: 1 }, id: 1 },
        { wrappedFace: { id: 2 }, id: 2 },
      ]);
      assert.equal(countFaces(deps, shape), 2);
      assert.deepEqual(shapeCenter(deps, shape), [3, 4, 5]);
      assert.deepEqual(makeCompoundFromShapes(deps, [{ id: "a" }, { id: "b" }]), {
        kind: "compound",
        shapes: [{ id: "a" }, { id: "b" }],
      });
    },
  },
  {
    name: "shape analysis primitives: axis projection and cylinder reference direction stay orthogonal to the axis",
    fn: async () => {
      assert.deepEqual(axisBounds([0, 0, 1], { min: [1, 2, -3], max: [5, 6, 7] }), {
        min: -3,
        max: 7,
      });
      assert.deepEqual(
        cylinderReferenceXDirection({
          axis: [0, 0, 1],
          xDir: [0, 0, 2],
          yDir: [0, 1, 0],
        }),
        [1, 0, 0]
      );
    },
  },
  {
    name: "shape analysis primitives: surface extents use surface adaptors and cylinder extents fall back to bounds",
    fn: async () => {
      const deps = makeDeps();
      const face = {
        bounds: { min: [0, 0, 2], max: [1, 1, 9] as [number, number, number] },
        u0: 5,
        u1: 1,
        v0: 7,
        v1: 2,
      };
      const fallbackFace = {
        bounds: { min: [0, 0, -2], max: [1, 1, 4] as [number, number, number] },
        adaptorError: true,
      };

      assert.deepEqual(surfaceUvExtents(deps, face), {
        uMin: 1,
        uMax: 5,
        vMin: 2,
        vMax: 7,
      });
      assert.deepEqual(cylinderVExtents(deps, face, { origin: [0, 0, 10], axis: [0, 0, 1] }), {
        min: 12,
        max: 17,
      });
      assert.deepEqual(
        cylinderVExtents(deps, fallbackFace, { origin: [0, 0, 0], axis: [0, 0, 1] }),
        {
          min: -2,
          max: 4,
        }
      );
      assert.equal(surfaceUvExtents(deps, fallbackFace), null);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
