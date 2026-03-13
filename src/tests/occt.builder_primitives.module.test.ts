import assert from "node:assert/strict";
import {
  addLoftWire,
  makeBoolean,
  makeChamferBuilder,
  makeDraftBuilder,
  makeFilletBuilder,
  makeLoftBuilder,
  makeSection,
  makeShapeList,
  type BuilderPrimitiveDeps,
} from "../occt/builder_primitives.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "builder primitives: construct fillet, chamfer, draft, and loft builders through fallback candidates",
    fn: async () => {
      const calls: Array<{ name: string; args: unknown[] }> = [];
      const deps: BuilderPrimitiveDeps = {
        occt: { ChFi3d_FilletShape: { ChFi3d_Rational: "rational" } },
        newOcct: (name: string, ...args: unknown[]) => {
          calls.push({ name, args });
          if (name === "BRepFilletAPI_MakeFillet" && args.length === 1) {
            return { kind: "fillet", args };
          }
          if (name === "BRepFilletAPI_MakeFillet") {
            throw new Error("unsupported fillet overload");
          }
          if (name === "BRepFilletAPI_MakeChamfer") {
            return { kind: "chamfer", args };
          }
          if (name === "BRepOffsetAPI_DraftAngle" && args.length === 0) {
            return { kind: "draft", args };
          }
          if (name === "BRepOffsetAPI_DraftAngle") {
            throw new Error("unsupported draft overload");
          }
          if (name === "BRepOffsetAPI_ThruSections" && args.length === 1) {
            return { kind: "loft", args };
          }
          if (name === "BRepOffsetAPI_ThruSections") {
            throw new Error("unsupported loft overload");
          }
          throw new Error(`unexpected ctor ${name}`);
        },
        tryBuild: () => {},
        makeProgressRange: () => ({ kind: "progress" }),
        callWithFallback: (target, methods, argSets) => {
          const method = methods.find((name) => typeof target[name] === "function");
          if (!method) throw new Error("missing method");
          return target[method](...(argSets[0] ?? []));
        },
        toWire: (wire) => ({ wrapped: wire }),
      };

      assert.deepEqual(makeFilletBuilder(deps, "shape"), { kind: "fillet", args: ["shape"] });
      assert.deepEqual(makeChamferBuilder(deps, "shape"), { kind: "chamfer", args: ["shape"] });
      assert.deepEqual(makeDraftBuilder(deps, "shape"), { kind: "draft", args: [] });
      assert.deepEqual(makeLoftBuilder(deps, true), { kind: "loft", args: [true] });

      const loft = {
        added: [] as unknown[],
        AddWire(wire: unknown) {
          this.added.push(wire);
        },
      };
      addLoftWire(deps, loft, { kind: "wire" });
      assert.deepEqual(loft.added, [{ wrapped: { kind: "wire" } }]);

      assert.deepEqual(
        calls.map((entry) => [entry.name, entry.args.length]),
        [
          ["BRepFilletAPI_MakeFillet", 2],
          ["BRepFilletAPI_MakeFillet", 1],
          ["BRepFilletAPI_MakeChamfer", 1],
          ["BRepOffsetAPI_DraftAngle", 1],
          ["BRepOffsetAPI_DraftAngle", 0],
          ["BRepOffsetAPI_ThruSections", 3],
          ["BRepOffsetAPI_ThruSections", 2],
          ["BRepOffsetAPI_ThruSections", 1],
        ]
      );
    },
  },
  {
    name: "builder primitives: boolean builder prefers progress constructor and falls back to generic constructors",
    fn: async () => {
      const built: unknown[] = [];
      function Fuse3(this: { args?: unknown[] }, left: unknown, right: unknown, progress: unknown) {
        this.args = [left, right, progress];
      }

      const progressDeps: BuilderPrimitiveDeps = {
        occt: { BRepAlgoAPI_Fuse_3: Fuse3 },
        newOcct: () => {
          throw new Error("unexpected generic constructor");
        },
        tryBuild: (builder) => built.push(builder),
        makeProgressRange: () => ({ kind: "progress" }),
        callWithFallback: () => {},
        toWire: (wire) => wire,
      };

      const progressBuilder = makeBoolean(progressDeps, "union", "left", "right") as { args: unknown[] };
      assert.deepEqual(progressBuilder.args, ["left", "right", { kind: "progress" }]);
      assert.equal(built.length, 1);

      const fallbackBuilt: unknown[] = [];
      const genericDeps: BuilderPrimitiveDeps = {
        occt: {},
        newOcct: (name: string, ...args: unknown[]) => {
          assert.equal(name, "BRepAlgoAPI_Cut");
          if (args.length === 3) throw new Error("unsupported overload");
          return { kind: "cut", args };
        },
        tryBuild: (builder) => fallbackBuilt.push(builder),
        makeProgressRange: () => ({ kind: "progress" }),
        callWithFallback: () => {},
        toWire: (wire) => wire,
      };

      assert.deepEqual(makeBoolean(genericDeps, "cut", "left", "right"), {
        kind: "cut",
        args: ["left", "right"],
      });
      assert.equal(fallbackBuilt.length, 1);
    },
  },
  {
    name: "builder primitives: section builders and shape lists use injected build and append helpers",
    fn: async () => {
      const built: unknown[] = [];
      const appended: unknown[] = [];
      const deps: BuilderPrimitiveDeps = {
        occt: {},
        newOcct: (name: string, ...args: unknown[]) => {
          if (name === "BRepAlgoAPI_Section" && args.length === 2) {
            return { kind: "section", args };
          }
          if (name === "BRepAlgoAPI_Section") {
            throw new Error("unsupported section overload");
          }
          if (name === "TopTools_ListOfShape") {
            return {
              Add(shape: unknown) {
                appended.push(shape);
              },
            };
          }
          throw new Error(`unexpected ctor ${name}`);
        },
        tryBuild: (builder) => built.push(builder),
        makeProgressRange: () => ({ kind: "progress" }),
        callWithFallback: (target, methods, argSets) => {
          const method = methods.find((name) => typeof target[name] === "function");
          if (!method) throw new Error("missing append method");
          return target[method](...(argSets[0] ?? []));
        },
        toWire: (wire) => wire,
      };

      assert.deepEqual(makeSection(deps, "left", "right"), {
        kind: "section",
        args: ["left", "right"],
      });
      assert.equal(built.length, 1);

      const list = makeShapeList(deps, ["a", "b"]);
      assert.ok(list);
      assert.deepEqual(appended, ["a", "b"]);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
