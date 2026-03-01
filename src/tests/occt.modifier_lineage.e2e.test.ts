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

function topEdgeSelection(result: ReturnType<typeof buildPart>, featureId: string) {
  const step = result.steps.find((entry) => entry.featureId === featureId);
  return (
    step?.result.selections
      .filter((selection) => selection.kind === "edge")
      .map((selection) => ({
        selection,
        centerZ:
          typeof selection.meta["centerZ"] === "number"
            ? (selection.meta["centerZ"] as number)
            : Number.NEGATIVE_INFINITY,
      }))
      .sort((a, b) => b.centerZ - a.centerZ)[0]?.selection ?? null
  );
}

function descendantEdgeSelections(
  result: ReturnType<typeof buildPart>,
  featureId: string,
  slotPrefix: string
) {
  return result.final.selections
    .filter(
      (selection) =>
        selection.kind === "edge" &&
        selection.meta["createdBy"] === featureId &&
        typeof selection.meta["selectionSlot"] === "string" &&
        (selection.meta["selectionSlot"] as string).startsWith(slotPrefix)
    )
    .sort((a, b) =>
      String(a.meta["selectionSlot"]).localeCompare(String(b.meta["selectionSlot"]))
    );
}

function findStepSelection(
  result: ReturnType<typeof buildPart>,
  featureId: string,
  predicate: (selection: (typeof result.steps)[number]["result"]["selections"][number]) => boolean
) {
  const step = result.steps.find((entry) => entry.featureId === featureId);
  return step?.result.selections.find(predicate);
}

const tests = [
  {
    name: "occt modifier lineage: hole emits wall slot derived from the target face",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("hole-lineage", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(20, 12) },
        ]),
        dsl.extrude("base", dsl.profileRef("profile:base"), 8, "body:main", [
          "sketch-base",
        ]),
        dsl.hole(
          "hole-1",
          dsl.selectorNamed("face:body.main~base.top"),
          "-Z",
          6,
          "throughAll"
        ),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing hole result body");
      assertValidShape(occt, body.meta["shape"] as any, "hole lineage result");

      const wall = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "hole-1" &&
          selection.meta["selectionSlot"] === "hole.top.wall"
      );
      assert.ok(wall, "missing hole wall selection");
      assert.equal(wall.id, "face:body.main~hole-1.hole.top.wall");
      assert.deepEqual(wall.meta["selectionLineage"], {
        kind: "modified",
        from: "face:body.main~base.top",
      });
    },
  },
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
    name: "occt modifier lineage: fillet emits seeded face slot with edge-derived lineage",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("fillet-lineage", [
        dsl.extrude("cyl", dsl.profileCircle(10), 20, "body:main"),
        dsl.fillet(
          "edge-fillet",
          dsl.selectorEdge([dsl.predCreatedBy("cyl")], [dsl.rankMaxZ()]),
          2,
          ["cyl"]
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing fillet result");
      assertValidShape(occt, output.meta["shape"] as any, "fillet lineage result");

      const source = topEdgeSelection(result, "cyl");
      assert.ok(source, "missing source fillet edge");

      const blend = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "edge-fillet" &&
          selection.meta["selectionSlot"] === "fillet.seed.1"
      );
      assert.ok(blend, "missing fillet blend face lineage");
      assert.equal(blend.id, "face:body.main~edge-fillet.fillet.seed.1");
      assert.deepEqual(blend.meta["selectionLineage"], {
        kind: "modified",
        from: source.id,
      });

      const descendantEdges = descendantEdgeSelections(
        result,
        "edge-fillet",
        "fillet.seed.1.bound."
      );
      assert.ok(
        descendantEdges.length >= 2,
        `expected at least 2 descendant fillet edges, got ${descendantEdges.length}`
      );
      const descendantSlots = new Set(
        descendantEdges.map((selection) => String(selection.meta["selectionSlot"]))
      );
      assert.ok(descendantSlots.has("fillet.seed.1.bound.top"));
      assert.ok(descendantSlots.has("fillet.seed.1.bound.side.1"));
      const seam = result.final.selections.find(
        (selection) =>
          selection.kind === "edge" &&
          selection.meta["createdBy"] === "edge-fillet" &&
          selection.meta["selectionSlot"] === "fillet.seed.1.seam"
      );
      assert.ok(seam, "missing fillet seam edge lineage");
      assert.equal(seam.id, "edge:body.main~edge-fillet.fillet.seed.1.seam");
      for (const edge of descendantEdges) {
        assert.deepEqual(edge.meta["selectionLineage"], {
          kind: "modified",
          from: source.id,
        });
      }
    },
  },
  {
    name: "occt modifier lineage: chamfer emits seeded face slot with edge-derived lineage",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("chamfer-lineage", [
        dsl.extrude("cyl", dsl.profileCircle(10), 20, "body:main"),
        dsl.chamfer(
          "edge-chamfer",
          dsl.selectorEdge([dsl.predCreatedBy("cyl")], [dsl.rankMaxZ()]),
          2,
          ["cyl"]
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing chamfer result");
      assertValidShape(occt, output.meta["shape"] as any, "chamfer lineage result");

      const source = topEdgeSelection(result, "cyl");
      assert.ok(source, "missing source chamfer edge");

      const blend = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "edge-chamfer" &&
          selection.meta["selectionSlot"] === "chamfer.seed.1"
      );
      assert.ok(blend, "missing chamfer face lineage");
      assert.equal(blend.id, "face:body.main~edge-chamfer.chamfer.seed.1");
      assert.deepEqual(blend.meta["selectionLineage"], {
        kind: "modified",
        from: source.id,
      });

      const descendantEdges = descendantEdgeSelections(
        result,
        "edge-chamfer",
        "chamfer.seed.1.bound."
      );
      assert.ok(
        descendantEdges.length >= 2,
        `expected at least 2 descendant chamfer edges, got ${descendantEdges.length}`
      );
      const descendantSlots = new Set(
        descendantEdges.map((selection) => String(selection.meta["selectionSlot"]))
      );
      assert.ok(descendantSlots.has("chamfer.seed.1.bound.top"));
      assert.ok(descendantSlots.has("chamfer.seed.1.bound.side.1"));
      for (const edge of descendantEdges) {
        assert.deepEqual(edge.meta["selectionLineage"], {
          kind: "modified",
          from: source.id,
        });
      }
    },
  },
  {
    name: "occt modifier lineage: multi-edge chamfer uses join slots for derived-to-derived edges",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("chamfer-join-lineage", [
        dsl.extrude("block", dsl.profileRect(20, 12), 10, "body:main"),
        dsl.chamfer(
          "edge-chamfer",
          dsl.selectorEdge([dsl.predCreatedBy("block")], [dsl.rankMaxZ()]),
          2,
          ["block"]
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing chamfer result");
      assertValidShape(occt, output.meta["shape"] as any, "multi-edge chamfer lineage result");

      const slots = result.final.selections
        .filter(
          (selection) =>
            selection.kind === "edge" &&
            selection.meta["createdBy"] === "edge-chamfer" &&
            typeof selection.meta["selectionSlot"] === "string"
        )
        .map((selection) => String(selection.meta["selectionSlot"]));

      assert.ok(
        slots.some((slot) => slot.includes(".join.chamfer.seed.")),
        `expected at least one derived-to-derived join slot, got ${JSON.stringify(slots)}`
      );
      assert.ok(
        !slots.some((slot) => slot.includes(".bound.chamfer.seed.")),
        `expected no derived-to-derived bound slots, got ${JSON.stringify(slots)}`
      );
      assert.ok(
        slots.some((slot) => slot === "chamfer.seed.1.bound.top"),
        `expected top boundary slot, got ${JSON.stringify(slots)}`
      );
      assert.ok(
        slots.some((slot) => slot === "chamfer.seed.1.bound.side.1"),
        `expected preserved-face side boundary slot, got ${JSON.stringify(slots)}`
      );
    },
  },
  {
    name: "occt modifier lineage: draft preserves selected side slot with modified lineage",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("draft-lineage", [
        dsl.extrude("base", dsl.profileRect(40, 20), 20, "body:base"),
        dsl.datumPlane("draft-neutral", "+Z", [0, 0, 0]),
        dsl.draft(
          "draft-1",
          dsl.selectorNamed("body:base"),
          dsl.selectorFace([
            dsl.predCreatedBy("base"),
            dsl.predPlanar(),
            dsl.predNormal("+X"),
          ]),
          dsl.planeDatum("draft-neutral"),
          "+Z",
          Math.PI / 60,
          "body:main",
          ["base", "draft-neutral"]
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing draft result");
      assertValidShape(occt, output.meta["shape"] as any, "draft lineage result");

      const drafted = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "draft-1" &&
          selection.meta["selectionLineage"] &&
          typeof selection.meta["selectionSlot"] === "string" &&
          (selection.meta["selectionSlot"] as string).startsWith("side.")
      );
      assert.ok(drafted, "missing drafted face lineage");
      const sourceId = (drafted?.meta["selectionLineage"] as { from?: string }).from;
      const source = findStepSelection(
        result,
        "base",
        (selection) => selection.id === sourceId
      );
      assert.ok(source, "missing drafted source face");
      assert.equal(drafted?.meta["selectionSlot"], source?.meta["selectionSlot"]);
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
    name: "occt modifier lineage: shell preserves bottom slot for unchanged outer face",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const topFace = dsl.selectorFace(
        [dsl.predCreatedBy("base"), dsl.predPlanar(), dsl.predNormal("+Z")],
        [dsl.rankMaxArea()]
      );
      const part = dsl.part("shell-lineage", [
        dsl.extrude("base", dsl.profileRect(60, 40), 20, "body:base"),
        dsl.shell(
          "shell-1",
          dsl.selectorNamed("body:base"),
          2,
          "body:main",
          undefined,
          { direction: "inside", openFaces: [topFace] }
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing shell result");
      assertValidShape(occt, output.meta["shape"] as any, "shell lineage result");

      const source = findStepSelection(
        result,
        "base",
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "base" &&
          selection.meta["selectionSlot"] === "bottom"
      );
      assert.ok(source, "missing source shell bottom face");

      const preserved = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "shell-1" &&
          selection.meta["selectionLineage"] &&
          (selection.meta["selectionLineage"] as { from?: string }).from === source.id
      );
      assert.ok(preserved, "missing shell preserved face lineage");
      assert.equal(preserved?.meta["selectionSlot"], "bottom");
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
