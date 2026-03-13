import assert from "node:assert/strict";
import {
  collectEdgesFromShape,
  collectFacesFromShape,
  collectToolFaces,
  containsShape,
  deleteFacesWithDefeaturing,
  isValidShape,
  makeSolidFromShells,
  replaceFacesWithReshape,
  solidVolume,
  uniqueFaceShapes,
  uniqueShapeList,
  type ShapeMutationPrimitiveDeps,
} from "../occt/shape_mutation_primitives.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(): ShapeMutationPrimitiveDeps {
  class Explorer {
    private items: any[] = [];
    private index = 0;
    Init(shape: { faces?: any[]; edges?: any[]; shells?: any[] }, kind: number) {
      this.items =
        kind === 1 ? (shape.shells ?? []) : kind === 2 ? (shape.faces ?? []) : (shape.edges ?? []);
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

  return {
    occt: {
      TopExp_Explorer_1: Explorer,
      TopAbs_ShapeEnum: {
        TopAbs_SHELL: 1,
        TopAbs_FACE: 2,
        TopAbs_EDGE: 3,
        TopAbs_SHAPE: 4,
      },
      GProp_GProps_1: class {
        Mass() {
          return 12;
        }
      },
      BRepGProp: {
        VolumeProperties_1: () => {},
      },
    },
    newOcct: (name: string, ...args: unknown[]) => {
      if (name === "BRepBuilderAPI_MakeSolid") {
        return {
          added: [] as unknown[],
          Add(shell: unknown) {
            this.added.push(shell);
          },
        };
      }
      if (name === "BRepAlgoAPI_Defeaturing") {
        return {
          SetShape() {},
          AddFacesToRemove() {},
        };
      }
      if (name === "BRepTools_ReShape") {
        return {
          Replace() {},
          Apply(shape: unknown) {
            return { kind: "reshaped", shape };
          },
        };
      }
      throw new Error(`unexpected ctor ${name}(${args.length})`);
    },
    callWithFallback: (target, methods, argSets) => {
      const method = methods.find((name) => typeof (target as Record<string, unknown>)[name] === "function");
      if (!method) throw new Error("missing method");
      const fn = (target as Record<string, (...args: unknown[]) => unknown>)[method];
      if (!fn) throw new Error("missing method");
      return fn.call(target, ...(argSets[0] ?? []));
    },
    tryBuild: () => {},
    readShape: (shape) => ({ kind: "shape", shape }),
    makeProgressRange: () => ({ kind: "progress" }),
    toFace: (face) => ({
      wrappedFace: face,
      id: face?.id,
      hash: face?.hash ?? face?.id,
    }),
    toEdge: (edge) => ({
      wrappedEdge: edge,
      id: edge?.id,
      hash: edge?.hash ?? edge?.id,
    }),
    toShell: (shell) => ({
      wrappedShell: shell,
      id: shell?.id,
      hash: shell?.hash ?? shell?.id,
    }),
    shapeHash: (shape) => (shape?.hash as number | undefined) ?? Number(shape?.id ?? 0),
    shapesSame: (left, right) => left?.id === right?.id,
    checkValid: () => true,
    countSolids: () => 1,
    makeShapeList: (shapes) => ({ kind: "shape-list", shapes }),
  };
}

const tests = [
  {
    name: "shape mutation primitives: shell and face/edge exploration use injected converters",
    fn: async () => {
      const deps = makeDeps();
      const shape = {
        shells: [{ id: 1 }],
        faces: [{ id: 2 }, { id: 3 }],
        edges: [{ id: 4 }],
      };

      const solid = makeSolidFromShells(deps, shape) as {
        kind: string;
        shape: { added: unknown[] };
      };
      assert.equal(solid.kind, "shape");
      assert.deepEqual(solid.shape.added, [{ wrappedShell: { id: 1 }, id: 1, hash: 1 }]);
      assert.deepEqual(collectFacesFromShape(deps, shape), [
        { wrappedFace: { id: 2 }, id: 2, hash: 2 },
        { wrappedFace: { id: 3 }, id: 3, hash: 3 },
      ]);
      assert.deepEqual(collectEdgesFromShape(deps, shape), [
        { wrappedEdge: { id: 4 }, id: 4, hash: 4 },
      ]);
    },
  },
  {
    name: "shape mutation primitives: defeaturing, reshape, and tool-face collection keep unique faces",
    fn: async () => {
      const deps = makeDeps();
      const faceA = { id: 1, hash: 1 };
      const faceB = { id: 2, hash: 2 };

      const defeatured = deleteFacesWithDefeaturing(deps, { id: 9 }, [faceA]) as {
        kind: string;
        shape: Record<string, unknown>;
      };
      assert.equal(defeatured.kind, "shape");
      assert.equal(typeof defeatured.shape.SetShape, "function");
      assert.equal(typeof defeatured.shape.AddFacesToRemove, "function");
      assert.deepEqual(replaceFacesWithReshape(deps, { id: 9 }, [{ from: faceA, to: faceB }]), {
        kind: "reshaped",
        shape: { id: 9 },
      });
      assert.deepEqual(
        collectToolFaces(deps, [
          { id: "face:a", kind: "face", meta: { shape: faceA } },
          { id: "surface:b", kind: "surface", meta: { shape: { faces: [faceA, faceB] } } },
        ] as any),
        [
          { wrappedFace: faceA, id: 1, hash: 1 },
          { wrappedFace: faceB, id: 2, hash: 2 },
        ]
      );
      assert.deepEqual(
        uniqueFaceShapes(deps, [
          { id: "face:a", kind: "face", meta: { shape: faceA } },
          { id: "face:b", kind: "face", meta: { shape: faceA } },
          { id: "face:c", kind: "face", meta: { shape: faceB } },
        ] as any),
        [
          { wrappedFace: faceA, id: 1, hash: 1 },
          { wrappedFace: faceB, id: 2, hash: 2 },
        ]
      );
    },
  },
  {
    name: "shape mutation primitives: uniqueness, containment, validity, and solid volume are delegated",
    fn: async () => {
      const deps = makeDeps();
      const shapes = [
        { id: 1, hash: 1 },
        { id: 1, hash: 1 },
        { id: 2, hash: 2 },
      ];

      assert.deepEqual(uniqueShapeList(deps, shapes), [shapes[0], shapes[2]]);
      assert.equal(containsShape(deps, [shapes[0]], shapes[1]), true);
      assert.equal(isValidShape(deps, { id: 5 }), true);
      assert.equal(solidVolume(deps, { id: 6 }), 12);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
