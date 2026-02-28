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
    name: "graph: selector.named resolves chamfer result outputs",
    fn: async () => {
      const part = dsl.part("named-chamfer-output", [
        dsl.booleanOp(
          "union",
          "union",
          dsl.selectorNamed("body:chamfer-1"),
          dsl.selectorNamed("body:tool"),
          "body:main"
        ),
        dsl.chamfer(
          "chamfer-1",
          dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMaxZ()]),
          1,
          { result: "body:chamfer-1" }
        ),
        dsl.extrude("base", dsl.profileRect(14, 14), 6, "body:seed"),
        dsl.extrude("tool", dsl.profileRect(6, 6), 6, "body:tool"),
      ]);
      const result = compilePart(part);
      const unionIndex = result.featureOrder.indexOf("union");
      assert.ok(result.featureOrder.indexOf("base") < result.featureOrder.indexOf("chamfer-1"));
      assert.ok(result.featureOrder.indexOf("chamfer-1") < unionIndex);
      assert.ok(result.featureOrder.indexOf("tool") < unionIndex);
    },
  },
  {
    name: "graph: selector.named resolves fillet result outputs",
    fn: async () => {
      const part = dsl.part("named-fillet-output", [
        dsl.booleanOp(
          "union",
          "union",
          dsl.selectorNamed("body:fillet-1"),
          dsl.selectorNamed("body:tool"),
          "body:main"
        ),
        dsl.fillet(
          "fillet-1",
          dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMaxZ()]),
          1,
          { result: "body:fillet-1" }
        ),
        dsl.extrude("base", dsl.profileRect(14, 14), 6, "body:seed"),
        dsl.extrude("tool", dsl.profileRect(6, 6), 6, "body:tool"),
      ]);
      const result = compilePart(part);
      const unionIndex = result.featureOrder.indexOf("union");
      assert.ok(result.featureOrder.indexOf("base") < result.featureOrder.indexOf("fillet-1"));
      assert.ok(result.featureOrder.indexOf("fillet-1") < unionIndex);
      assert.ok(result.featureOrder.indexOf("tool") < unionIndex);
    },
  },
  {
    name: "graph: selector.named resolves hole result outputs",
    fn: async () => {
      const part = dsl.part("named-hole-output", [
        dsl.booleanOp(
          "union",
          "union",
          dsl.selectorNamed("body:hole-1"),
          dsl.selectorNamed("body:tool"),
          "body:main"
        ),
        dsl.hole(
          "hole-1",
          dsl.selectorFace([dsl.predCreatedBy("base"), dsl.predPlanar()], [dsl.rankMaxZ()]),
          "-Z",
          4,
          "throughAll",
          { result: "body:hole-1" }
        ),
        dsl.extrude("base", dsl.profileRect(14, 14), 6, "body:seed"),
        dsl.extrude("tool", dsl.profileRect(6, 6), 6, "body:tool"),
      ]);
      const result = compilePart(part);
      const unionIndex = result.featureOrder.indexOf("union");
      assert.ok(result.featureOrder.indexOf("base") < result.featureOrder.indexOf("hole-1"));
      assert.ok(result.featureOrder.indexOf("hole-1") < unionIndex);
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
    name: "graph: move face infers source output and datum axis dependencies",
    fn: async () => {
      const part = dsl.part("move-face-deps", [
        dsl.moveFace(
          "move-face",
          dsl.selectorNamed("body:main"),
          dsl.selectorFace([dsl.predCreatedBy("base"), dsl.predPlanar()], [dsl.rankMaxZ()]),
          "body:moved",
          undefined,
          {
            rotationAxis: dsl.axisDatum("axis-1"),
            rotationAngle: Math.PI / 12,
          }
        ),
        dsl.extrude("base", dsl.profileRect(8, 8), 4, "body:main"),
        dsl.datumAxis("axis-1", "+Z"),
      ]);
      const result = compilePart(part);
      const moveIndex = result.featureOrder.indexOf("move-face");
      assert.ok(result.featureOrder.indexOf("base") < moveIndex);
      assert.ok(result.featureOrder.indexOf("axis-1") < moveIndex);
    },
  },
  {
    name: "graph: variable fillet infers source output dependencies",
    fn: async () => {
      const part = dsl.part("variable-fillet-deps", [
        dsl.variableFillet(
          "fillet-var",
          dsl.selectorNamed("body:main"),
          [
            {
              edge: dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMaxZ()]),
              radius: 1.2,
            },
            {
              edge: dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMinZ()]),
              radius: 0.8,
            },
          ],
          "body:filleted"
        ),
        dsl.extrude("base", dsl.profileCircle(8), 6, "body:main"),
      ]);
      const result = compilePart(part);
      const index = result.featureOrder.indexOf("fillet-var");
      assert.ok(result.featureOrder.indexOf("base") < index);
    },
  },
  {
    name: "graph: variable chamfer infers source output dependencies",
    fn: async () => {
      const part = dsl.part("variable-chamfer-deps", [
        dsl.variableChamfer(
          "chamfer-var",
          dsl.selectorNamed("body:main"),
          [
            {
              edge: dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMaxZ()]),
              distance: 1,
            },
            {
              edge: dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMinZ()]),
              distance: 0.6,
            },
          ],
          "body:chamfered"
        ),
        dsl.extrude("base", dsl.profileCircle(8), 6, "body:main"),
      ]);
      const result = compilePart(part);
      const index = result.featureOrder.indexOf("chamfer-var");
      assert.ok(result.featureOrder.indexOf("base") < index);
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
    name: "graph: selector.named explicit stable selection id is accepted",
    fn: async () => {
      const part = dsl.part("named-selection-id", [
        dsl.extrude("base", dsl.profileRect(10, 10), 5, "body:main"),
        dsl.fillet(
          "fillet",
          dsl.selectorNamed("edge:body.main~base.hseed"),
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
    name: "graph: selector.named semantic slot selection id is accepted",
    fn: async () => {
      const part = dsl.part("named-selection-slot", [
        dsl.extrude("base", dsl.profileRect(10, 10), 5, "body:main"),
        dsl.fillet(
          "fillet",
          dsl.selectorNamed("edge:body.main~base.side.1"),
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
    name: "graph: selector.named multi stable selection ids are accepted",
    fn: async () => {
      const part = dsl.part("named-selection-id-list", [
        dsl.extrude("base", dsl.profileRect(10, 10), 5, "body:main"),
        dsl.fillet(
          "fillet",
          dsl.selectorNamed(
            "edge:body.main~base.ha, edge:body.main~base.hb, edge:body.main~base.ha"
          ),
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
  {
    name: "graph: sketch plane selector to output infers host dependency",
    fn: async () => {
      const part = dsl.part("sketch-plane-output-deps", [
        dsl.sketch2d(
          "a-sketch",
          [{ name: "profile:cut", profile: dsl.profileRect(4, 4) }],
          { plane: dsl.selectorNamed("surface:host-face") }
        ),
        dsl.plane("z-plane", 20, 20, "surface:host-face"),
      ]);
      const result = compilePart(part);
      assert.ok(
        result.featureOrder.indexOf("z-plane") <
          result.featureOrder.indexOf("a-sketch")
      );
    },
  },
  {
    name: "graph: sketch plane selector using raw face id is rejected as legacy",
    fn: async () => {
      const part = dsl.part("sketch-plane-face-id-no-deps", [
        dsl.sketch2d(
          "a-sketch",
          [{ name: "profile:cut", profile: dsl.profileRect(4, 4) }],
          { plane: dsl.selectorNamed("face:130") }
        ),
        dsl.extrude("z-extrude", dsl.profileRect(20, 20), 6, "body:main"),
      ]);
      assert.throws(
        () => compilePart(part),
        (err) =>
          err instanceof CompileError &&
          err.code === "selector_legacy_numeric_unsupported" &&
          err.details?.["referenceId"] === "face:130"
      );
    },
  },
  {
    name: "graph: sketch plane selector face id is rejected even with explicit deps",
    fn: async () => {
      const part = dsl.part("sketch-plane-face-id-explicit-deps", [
        dsl.sketch2d(
          "a-sketch",
          [{ name: "profile:cut", profile: dsl.profileRect(4, 4) }],
          { plane: dsl.selectorNamed("face:130"), deps: ["z-extrude"] }
        ),
        dsl.extrude("z-extrude", dsl.profileRect(20, 20), 6, "body:main"),
      ]);
      assert.throws(
        () => compilePart(part),
        (err) =>
          err instanceof CompileError &&
          err.code === "selector_legacy_numeric_unsupported" &&
          err.details?.["referenceId"] === "face:130"
      );
    },
  },
  {
    name: "graph: sketch plane selector using stable face id infers dependency",
    fn: async () => {
      const part = dsl.part("sketch-plane-stable-face-id", [
        dsl.sketch2d(
          "a-sketch",
          [{ name: "profile:cut", profile: dsl.profileRect(4, 4) }],
          { plane: dsl.selectorNamed("face:body.main~z-extrude.hseed") }
        ),
        dsl.extrude("z-extrude", dsl.profileRect(20, 20), 6, "body:main"),
      ]);
      const result = compilePart(part);
      assert.ok(
        result.featureOrder.indexOf("z-extrude") <
          result.featureOrder.indexOf("a-sketch")
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
