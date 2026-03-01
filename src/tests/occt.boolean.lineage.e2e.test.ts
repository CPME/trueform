import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { assertValidShape, getBackendContext, runTests } from "./occt_test_utils.js";

function buildSubtractPocketPart() {
  return dsl.part("boolean-lineage-subtract", [
    dsl.extrude("base", dsl.profileRect(20, 20), 12, "body:left"),
    dsl.extrude("tool-seed", dsl.profileRect(8, 8), 6, "body:tool-seed"),
    dsl.moveBody("tool-move", dsl.selectorNamed("body:tool-seed"), "body:right", [
      "tool-seed",
    ], {
      translation: [0, 0, 6],
    }),
    dsl.booleanOp(
      "subtract-1",
      "subtract",
      dsl.selectorNamed("body:left"),
      dsl.selectorNamed("body:right"),
      "body:main"
    ),
  ]);
}

const tests = [
  {
    name: "occt boolean lineage: union preserves unchanged left bottom face slot",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("boolean-lineage-union", [
        dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:left"),
        dsl.extrude("tool-seed", dsl.profileRect(8, 8), 6, "body:tool-seed"),
        dsl.moveBody("tool-move", dsl.selectorNamed("body:tool-seed"), "body:right", [
          "tool-seed",
        ], {
          translation: [0, 0, 10],
        }),
        dsl.booleanOp(
          "union-1",
          "union",
          dsl.selectorNamed("body:left"),
          dsl.selectorNamed("body:right"),
          "body:main"
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing union result");
      assertValidShape(occt, output.meta["shape"] as any, "union lineage result");

      const bottom = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "union-1" &&
          selection.meta["selectionSlot"] === "bottom"
      );
      assert.ok(bottom, "missing preserved union bottom face");
      assert.equal(bottom.id, "face:body.main~union-1.bottom");
      assert.deepEqual(bottom.meta["selectionLineage"], {
        kind: "modified",
        from: "face:body.left~base.bottom",
      });
    },
  },
  {
    name: "occt boolean lineage: subtract preserves unchanged left bottom face slot",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = buildSubtractPocketPart();

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing subtract result");
      assertValidShape(occt, output.meta["shape"] as any, "subtract lineage result");

      const bottom = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "subtract-1" &&
          selection.meta["selectionSlot"] === "bottom"
      );
      assert.ok(bottom, "missing preserved subtract bottom face");
      assert.equal(bottom.id, "face:body.main~subtract-1.bottom");
      assert.deepEqual(bottom.meta["selectionLineage"], {
        kind: "modified",
        from: "face:body.left~base.bottom",
      });
    },
  },
  {
    name: "occt boolean lineage: subtract emits semantic cut face slots from tool faces",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const result = buildPart(buildSubtractPocketPart(), backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing subtract result");
      assertValidShape(occt, output.meta["shape"] as any, "subtract cut-face result");

      const cutBottom = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "subtract-1" &&
          selection.meta["selectionSlot"] === "cut.bottom"
      );
      assert.ok(cutBottom, "missing semantic cut.bottom face");
      assert.equal(cutBottom.id, "face:body.main~subtract-1.cut.bottom");
      assert.deepEqual(cutBottom.meta["selectionLineage"], {
        kind: "modified",
        from: "face:body.right~tool-move.bottom",
      });

      const cutWall = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "subtract-1" &&
          typeof selection.meta["selectionSlot"] === "string" &&
          (selection.meta["selectionSlot"] as string).startsWith("cut.side.")
      );
      assert.ok(cutWall, "missing semantic cut side face");

      const cutTop = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "subtract-1" &&
          selection.meta["selectionSlot"] === "cut.top"
      );
      assert.equal(cutTop, undefined, "tool exit cap should not be mislabeled as cut.top");

      const top = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "subtract-1" &&
          selection.meta["selectionSlot"] === "top"
      );
      assert.ok(top, "missing preserved top face");
      assert.equal(top.id, "face:body.main~subtract-1.top");

      const side = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "subtract-1" &&
          selection.meta["selectionSlot"] === "side.1"
      );
      assert.ok(side, "missing preserved side.1 face");
    },
  },
  {
    name: "occt boolean lineage: subtract emits semantic cut edge slots",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const result = buildPart(buildSubtractPocketPart(), backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing subtract result");
      assertValidShape(occt, output.meta["shape"] as any, "subtract cut-edge result");

      const edge = result.final.selections.find(
        (selection) =>
          selection.kind === "edge" &&
          selection.meta["createdBy"] === "subtract-1" &&
          typeof selection.meta["selectionSlot"] === "string" &&
          (selection.meta["selectionSlot"] as string).startsWith("cut.") &&
          (selection.meta["selectionSlot"] as string).includes(".join.cut.")
      );
      assert.ok(edge, "missing semantic cut join edge");
      assert.match(
        edge.id,
        /^edge:body\.main~subtract-1\.cut\..+\.join\.cut\..+(?:\.part\.\d+)?$/
      );

      const boundary = result.final.selections.find(
        (selection) =>
          selection.kind === "edge" &&
          selection.meta["createdBy"] === "subtract-1" &&
          typeof selection.meta["selectionSlot"] === "string" &&
          (selection.meta["selectionSlot"] as string).startsWith("cut.") &&
          (selection.meta["selectionSlot"] as string).includes(".bound.top")
      );
      assert.ok(boundary, "missing semantic cut boundary edge");
      assert.match(
        boundary.id,
        /^edge:body\.main~subtract-1\.cut\..+\.bound\.top(?:\.part\.\d+)?$/
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
