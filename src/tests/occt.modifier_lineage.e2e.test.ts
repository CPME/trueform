import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { assertValidShape, getBackendContext, runTests } from "./occt_test_utils.js";

function topFaceSelection(result: ReturnType<typeof buildPart>, featureId: string) {
  return result.final.selections.find(
    (selection) =>
      selection.kind === "face" &&
      selection.meta["createdBy"] === featureId &&
      selection.meta["selectionSlot"] === "top"
  );
}

function bottomFaceSelection(result: ReturnType<typeof buildPart>, featureId: string) {
  return result.final.selections.find(
    (selection) =>
      selection.kind === "face" &&
      selection.meta["createdBy"] === featureId &&
      selection.meta["selectionSlot"] === "bottom"
  );
}

const tests = [
  {
    name: "occt modifier lineage: move face preserves top-face slot with modified lineage",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("move-face-lineage", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(20, 12) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
          "sketch-base",
        ]),
        dsl.moveFace(
          "move-top",
          dsl.selectorNamed("body:main"),
          dsl.selectorNamed("face:body.main~base-extrude.top"),
          "body:moved",
          ["base-extrude"],
          { translation: [0, 0, 1], heal: true }
        ),
      ]);

      const result = buildPart(part, backend);
      const moved = result.final.outputs.get("body:moved");
      assert.ok(moved, "missing move-face result");
      assertValidShape(occt, moved.meta["shape"] as any, "move-face lineage result");

      const top = topFaceSelection(result, "move-top");
      assert.ok(top, "missing moved top face selection");
      assert.equal(top.id, "face:body.moved~move-top.top");
      assert.deepEqual(top.meta["selectionLineage"], {
        kind: "modified",
        from: "face:body.main~base-extrude.top",
      });
    },
  },
  {
    name: "occt modifier lineage: replace face preserves top-face slot with modified lineage",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("replace-face-lineage", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(20, 12) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
          "sketch-base",
        ]),
        dsl.plane("replace-tool", 20, 12, "surface:tool", {
          origin: [0, 0, 8],
          deps: ["base-extrude"],
        }),
        dsl.replaceFace(
          "replace-top",
          dsl.selectorNamed("body:main"),
          dsl.selectorNamed("face:body.main~base-extrude.top"),
          dsl.selectorNamed("surface:tool"),
          "body:replaced",
          ["base-extrude", "replace-tool"],
          { heal: true }
        ),
      ]);

      const result = buildPart(part, backend);
      const replaced = result.final.outputs.get("body:replaced");
      assert.ok(replaced, "missing replace-face result");
      assertValidShape(occt, replaced.meta["shape"] as any, "replace-face lineage result");

      const top = topFaceSelection(result, "replace-top");
      assert.ok(top, "missing replaced top face selection");
      assert.equal(top.id, "face:body.replaced~replace-top.top");
      assert.deepEqual(top.meta["selectionLineage"], {
        kind: "modified",
        from: "face:body.main~base-extrude.top",
      });
    },
  },
  {
    name: "occt modifier lineage: delete face preserves bottom-face slot with modified lineage",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("delete-face-lineage", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(20, 12) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 8, "body:main", [
          "sketch-base",
        ]),
        dsl.deleteFace(
          "delete-top",
          dsl.selectorNamed("body:main"),
          dsl.selectorNamed("face:body.main~base-extrude.top"),
          "surface:opened",
          ["base-extrude"],
          { heal: false }
        ),
      ]);

      const result = buildPart(part, backend);
      const opened = result.final.outputs.get("surface:opened");
      assert.ok(opened, "missing delete-face result");
      assertValidShape(occt, opened.meta["shape"] as any, "delete-face lineage result");

      const bottom = bottomFaceSelection(result, "delete-top");
      assert.ok(bottom, "missing preserved bottom face selection");
      assert.equal(bottom.id, "face:surface.opened~delete-top.bottom");
      assert.deepEqual(bottom.meta["selectionLineage"], {
        kind: "modified",
        from: "face:body.main~base-extrude.bottom",
      });
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
