import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { compilePart } from "../compiler.js";
import { CompileError } from "../graph.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "graph: profile.ref infers sketch dependency",
    fn: async () => {
      const part = dsl.part("profile-ref", [
        dsl.extrude("extrude", dsl.profileRef("profile:base"), 5, "body:main"),
        dsl.sketch2d("sketch", [
          { name: "profile:base", profile: dsl.profileRect(10, 10) },
        ]),
      ]);
      const result = compilePart(part);
      assert.ok(
        result.featureOrder.indexOf("sketch") <
          result.featureOrder.indexOf("extrude")
      );
    },
  },
  {
    name: "graph: profile.ref missing profile throws",
    fn: async () => {
      const part = dsl.part("profile-missing", [
        dsl.extrude("extrude", dsl.profileRef("profile:nope"), 5, "body:main"),
      ]);
      assert.throws(
        () => compilePart(part),
        (err) => err instanceof CompileError && err.code === "profile_missing"
      );
    },
  },
  {
    name: "graph: selector.named infers output dependency",
    fn: async () => {
      const part = dsl.part("named-output", [
        dsl.booleanOp(
          "union",
          "union",
          dsl.selectorNamed("body:base"),
          dsl.selectorNamed("body:tool"),
          "body:main"
        ),
        dsl.extrude("tool", dsl.profileRect(6, 6), 5, "body:tool"),
        dsl.extrude("base", dsl.profileRect(10, 10), 5, "body:base"),
      ]);
      const result = compilePart(part);
      const unionIndex = result.featureOrder.indexOf("union");
      assert.ok(result.featureOrder.indexOf("base") < unionIndex);
      assert.ok(result.featureOrder.indexOf("tool") < unionIndex);
    },
  },
  {
    name: "graph: move body infers source output and datum axis dependencies",
    fn: async () => {
      const part = dsl.part("move-body-deps", [
        dsl.moveBody(
          "move",
          dsl.selectorNamed("body:main"),
          "body:moved",
          undefined,
          {
            rotationAxis: dsl.axisDatum("axis-1"),
            rotationAngle: Math.PI / 4,
          }
        ),
        dsl.extrude("base", dsl.profileRect(8, 8), 4, "body:main"),
        dsl.datumAxis("axis-1", "+Z"),
      ]);
      const result = compilePart(part);
      const moveIndex = result.featureOrder.indexOf("move");
      assert.ok(result.featureOrder.indexOf("base") < moveIndex);
      assert.ok(result.featureOrder.indexOf("axis-1") < moveIndex);
    },
  },
  {
    name: "graph: delete face infers source output dependency",
    fn: async () => {
      const part = dsl.part("delete-face-deps", [
        dsl.deleteFace(
          "delete-face",
          dsl.selectorNamed("body:main"),
          dsl.selectorFace([dsl.predCreatedBy("base"), dsl.predPlanar()], [dsl.rankMaxZ()]),
          "surface:opened"
        ),
        dsl.extrude("base", dsl.profileRect(8, 8), 4, "body:main"),
      ]);
      const result = compilePart(part);
      const deleteIndex = result.featureOrder.indexOf("delete-face");
      assert.ok(result.featureOrder.indexOf("base") < deleteIndex);
    },
  },
  {
    name: "graph: replace face infers source and tool output dependencies",
    fn: async () => {
      const part = dsl.part("replace-face-deps", [
        dsl.replaceFace(
          "replace-face",
          dsl.selectorNamed("body:main"),
          dsl.selectorFace([dsl.predCreatedBy("base"), dsl.predPlanar()], [dsl.rankMaxZ()]),
          dsl.selectorNamed("surface:tool"),
          "body:replaced"
        ),
        dsl.extrude("base", dsl.profileRect(8, 8), 4, "body:main"),
        dsl.plane("tool", 12, 12, "surface:tool", { origin: [0, 0, 4] }),
      ]);
      const result = compilePart(part);
      const replaceIndex = result.featureOrder.indexOf("replace-face");
      assert.ok(result.featureOrder.indexOf("base") < replaceIndex);
      assert.ok(result.featureOrder.indexOf("tool") < replaceIndex);
    },
  },
  {
    name: "graph: selector.named missing output throws",
    fn: async () => {
      const part = dsl.part("named-missing", [
        dsl.booleanOp(
          "union",
          "union",
          dsl.selectorNamed("body:missing"),
          dsl.selectorNamed("body:tool"),
          "body:main"
        ),
        dsl.extrude("tool", dsl.profileRect(6, 6), 5, "body:tool"),
      ]);
      assert.throws(
        () => compilePart(part),
        (err) =>
          err instanceof CompileError && err.code === "selector_named_missing"
      );
    },
  },
  {
    name: "graph: selector.named explicit selection id is accepted",
    fn: async () => {
      const part = dsl.part("named-selection-id", [
        dsl.extrude("base", dsl.profileRect(10, 10), 5, "body:main"),
        dsl.fillet("fillet", dsl.selectorNamed("edge:7"), 1, ["base"]),
      ]);
      const result = compilePart(part);
      assert.ok(
        result.featureOrder.indexOf("base") <
          result.featureOrder.indexOf("fillet")
      );
    },
  },
  {
    name: "graph: selector.named multi selection ids are accepted",
    fn: async () => {
      const part = dsl.part("named-selection-id-list", [
        dsl.extrude("base", dsl.profileRect(10, 10), 5, "body:main"),
        dsl.fillet(
          "fillet",
          dsl.selectorNamed("edge:7, edge:9, edge:7"),
          1,
          ["base"]
        ),
      ]);
      const result = compilePart(part);
      assert.ok(
        result.featureOrder.indexOf("base") <
          result.featureOrder.indexOf("fillet")
      );
    },
  },
  {
    name: "graph: pred.createdBy infers dependency",
    fn: async () => {
      const part = dsl.part("created-by", [
        dsl.fillet(
          "fillet",
          dsl.selectorEdge([dsl.predCreatedBy("base")]),
          1
        ),
        dsl.extrude("base", dsl.profileRect(10, 10), 5, "body:main"),
      ]);
      const result = compilePart(part);
      assert.ok(
        result.featureOrder.indexOf("base") <
          result.featureOrder.indexOf("fillet")
      );
    },
  },
  {
    name: "graph: pred.createdBy missing id throws",
    fn: async () => {
      const part = dsl.part("created-by-missing", [
        dsl.fillet(
          "fillet",
          dsl.selectorEdge([dsl.predCreatedBy("missing")]),
          1
        ),
      ]);
      assert.throws(
        () => compilePart(part),
        (err) =>
          err instanceof CompileError && err.code === "pred_created_by_missing"
      );
    },
  },
  {
    name: "graph: pattern.ref missing pattern throws",
    fn: async () => {
      const part = dsl.part("pattern-missing", [
        dsl.hole(
          "hole",
          dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()]),
          "-Z",
          10,
          "throughAll",
          { pattern: { kind: "pattern.linear", ref: "pattern-1" } }
        ),
      ]);
      assert.throws(
        () => compilePart(part),
        (err) => err instanceof CompileError && err.code === "pattern_missing"
      );
    },
  },
  {
    name: "graph: duplicate profile names throw",
    fn: async () => {
      const part = dsl.part("dup-profiles", [
        dsl.sketch2d("sketch-a", [
          { name: "profile:dup", profile: dsl.profileRect(10, 10) },
        ]),
        dsl.sketch2d("sketch-b", [
          { name: "profile:dup", profile: dsl.profileRect(12, 12) },
        ]),
      ]);
      assert.throws(
        () => compilePart(part),
        (err) => err instanceof CompileError && err.code === "profile_duplicate"
      );
    },
  },
  {
    name: "graph: duplicate output names throw",
    fn: async () => {
      const part = dsl.part("dup-outputs", [
        dsl.extrude("a", dsl.profileRect(10, 10), 5, "body:main"),
        dsl.extrude("b", dsl.profileRect(12, 12), 5, "body:main"),
      ]);
      assert.throws(
        () => compilePart(part),
        (err) => err instanceof CompileError && err.code === "output_duplicate"
      );
    },
  },
  {
    name: "graph: selector without anchors requires explicit deps",
    fn: async () => {
      const part = dsl.part("anchorless", [
        dsl.extrude("base", dsl.profileRect(10, 10), 5, "body:main"),
        dsl.fillet(
          "fillet",
          dsl.selectorEdge([dsl.predRole("edge")]),
          1
        ),
      ]);
      assert.throws(
        () => compilePart(part),
        (err) =>
          err instanceof CompileError && err.code === "selector_anchor_missing"
      );
    },
  },
  {
    name: "graph: explicit dep missing id throws",
    fn: async () => {
      const part = dsl.part("dep-missing", [
        dsl.extrude(
          "extrude",
          dsl.profileRect(10, 10),
          5,
          "body:main",
          ["nope"]
        ),
      ]);
      assert.throws(
        () => compilePart(part),
        (err) => err instanceof CompileError && err.code === "dep_missing"
      );
    },
  },
  {
    name: "graph: explicit deps allow anchorless selector",
    fn: async () => {
      const part = dsl.part("anchorless-explicit", [
        dsl.extrude("base", dsl.profileRect(10, 10), 5, "body:main"),
        dsl.fillet(
          "fillet",
          dsl.selectorEdge([dsl.predRole("edge")]),
          1,
          ["base"]
        ),
      ]);
      const result = compilePart(part);
      assert.ok(
        result.featureOrder.indexOf("base") <
          result.featureOrder.indexOf("fillet")
      );
    },
  },
  {
    name: "graph: explicit deps merge with inferred deps",
    fn: async () => {
      const part = dsl.part("merged-deps", [
        dsl.extrude(
          "extrude",
          dsl.profileRef("profile:base"),
          5,
          "body:main",
          ["datum-1"]
        ),
        dsl.sketch2d("sketch", [
          { name: "profile:base", profile: dsl.profileRect(10, 10) },
        ]),
        dsl.datumPlane("datum-1", "+Z"),
      ]);
      const result = compilePart(part);
      const extrudeIndex = result.featureOrder.indexOf("extrude");
      assert.ok(result.featureOrder.indexOf("sketch") < extrudeIndex);
      assert.ok(result.featureOrder.indexOf("datum-1") < extrudeIndex);
    },
  },
  {
    name: "graph: draft infers source + datum dependencies",
    fn: async () => {
      const part = dsl.part("draft-deps", [
        dsl.datumAxis("pull-axis", "+Z"),
        dsl.datumPlane("neutral", "+Z"),
        dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:base"),
        dsl.draft(
          "draft-1",
          dsl.selectorNamed("body:base"),
          dsl.selectorFace([
            dsl.predCreatedBy("base"),
            dsl.predPlanar(),
            dsl.predNormal("+X"),
          ]),
          dsl.planeDatum("neutral"),
          dsl.axisDatum("pull-axis"),
          Math.PI / 60,
          "body:main"
        ),
      ]);
      const result = compilePart(part);
      const draftIndex = result.featureOrder.indexOf("draft-1");
      assert.ok(result.featureOrder.indexOf("base") < draftIndex);
      assert.ok(result.featureOrder.indexOf("neutral") < draftIndex);
      assert.ok(result.featureOrder.indexOf("pull-axis") < draftIndex);
    },
  },
  {
    name: "graph: plane infers datum plane dependency",
    fn: async () => {
      const part = dsl.part("plane-datum-deps", [
        dsl.plane("plane-1", 20, 10, "surface:main", {
          plane: dsl.planeDatum("datum-1"),
        }),
        dsl.datumPlane("datum-1", "+Z"),
      ]);
      const result = compilePart(part);
      assert.ok(
        result.featureOrder.indexOf("datum-1") <
          result.featureOrder.indexOf("plane-1")
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
