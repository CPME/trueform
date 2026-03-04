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

function buildIntersectOverlapPart() {
  return dsl.part("boolean-lineage-intersect", [
    dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:left"),
    dsl.extrude("tool-seed", dsl.profileRect(8, 8), 12, "body:tool-seed"),
    dsl.moveBody("tool-move", dsl.selectorNamed("body:tool-seed"), "body:right", [
      "tool-seed",
    ], {
      translation: [0, 0, 4],
    }),
    dsl.booleanOp(
      "intersect-1",
      "intersect",
      dsl.selectorNamed("body:left"),
      dsl.selectorNamed("body:right"),
      "body:main"
    ),
  ]);
}

function buildUnionStackPart() {
  return dsl.part("boolean-lineage-union", [
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
}

const tests = [
  {
    name: "occt boolean lineage: union preserves unchanged left bottom face slot",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = buildUnionStackPart();

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
    name: "occt boolean lineage: union emits disambiguated right face slots",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const result = buildPart(buildUnionStackPart(), backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing union result");
      assertValidShape(occt, output.meta["shape"] as any, "union disambiguated face result");

      const leftSide = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "union-1" &&
          selection.meta["selectionSlot"] === "side.1"
      );
      assert.ok(leftSide, "missing left side.1 face");
      assert.equal(leftSide.id, "face:body.main~union-1.side.1");
      assert.deepEqual(leftSide.meta["selectionLineage"], {
        kind: "modified",
        from: "face:body.left~base.side.1",
      });

      const rightSide = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "union-1" &&
          selection.meta["selectionSlot"] === "right.side.1"
      );
      assert.ok(rightSide, "missing right.side.1 face");
      assert.equal(rightSide.id, "face:body.main~union-1.right.side.1");
      assert.deepEqual(rightSide.meta["selectionLineage"], {
        kind: "modified",
        from: "face:body.right~tool-move.side.1",
      });

      const top = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "union-1" &&
          selection.meta["selectionSlot"] === "top"
      );
      assert.ok(top, "missing preserved union top face");
      assert.equal(top.id, "face:body.main~union-1.top");
    },
  },
  {
    name: "occt boolean lineage: union emits semantic edge slots from face adjacency",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const result = buildPart(buildUnionStackPart(), backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing union result");
      assertValidShape(occt, output.meta["shape"] as any, "union semantic edge result");

      const boundary = result.final.selections.find(
        (selection) =>
          selection.kind === "edge" &&
          selection.meta["createdBy"] === "union-1" &&
          selection.meta["selectionSlot"] === "right.side.1.bound.top"
      );
      assert.ok(boundary, "missing right.side.1.bound.top edge");
      assert.equal(boundary.id, "edge:body.main~union-1.right.side.1.bound.top");
      assert.equal(
        boundary.meta["selectionSignature"],
        "boolean.edge.v1|bound|right.side.1|top|right.side.1|top"
      );
      assert.deepEqual(boundary.meta["selectionProvenance"], {
        version: 1,
        relation: "bound",
        faceSlots: ["right.side.1", "top"],
        baseFaceSlots: ["right.side.1", "top"],
        rootSlot: "right.side.1",
        targetSlot: "top",
      });

      const join = result.final.selections.find(
        (selection) =>
          selection.kind === "edge" &&
          selection.meta["createdBy"] === "union-1" &&
          selection.meta["selectionSlot"] === "right.side.1.join.right.side.2"
      );
      assert.ok(join, "missing right.side.1.join.right.side.2 edge");
      assert.equal(join.id, "edge:body.main~union-1.right.side.1.join.right.side.2");
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
  {
    name: "occt boolean lineage: intersect preserves semantic overlap face slots",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const result = buildPart(buildIntersectOverlapPart(), backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing intersect result");
      assertValidShape(occt, output.meta["shape"] as any, "intersect lineage result");

      const top = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "intersect-1" &&
          selection.meta["selectionSlot"] === "top"
      );
      assert.ok(top, "missing preserved intersect top face");
      assert.equal(top.id, "face:body.main~intersect-1.top");
      assert.deepEqual(top.meta["selectionLineage"], {
        kind: "modified",
        from: "face:body.left~base.top",
      });

      const bottom = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "intersect-1" &&
          selection.meta["selectionSlot"] === "bottom"
      );
      assert.ok(bottom, "missing preserved intersect bottom face");
      assert.equal(bottom.id, "face:body.main~intersect-1.bottom");
      assert.deepEqual(bottom.meta["selectionLineage"], {
        kind: "modified",
        from: "face:body.right~tool-move.bottom",
      });

      const sideSlots = result.final.selections
        .filter(
          (selection) =>
            selection.kind === "face" &&
            selection.meta["createdBy"] === "intersect-1" &&
            typeof selection.meta["selectionSlot"] === "string" &&
            /^side\.\d+$/.test(selection.meta["selectionSlot"] as string)
        )
        .map((selection) => selection.meta["selectionSlot"] as string)
        .sort();
      assert.deepEqual(sideSlots, ["side.1", "side.2", "side.3", "side.4"]);
    },
  },
  {
    name: "occt boolean lineage: intersect emits semantic edge slots from face adjacency",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const result = buildPart(buildIntersectOverlapPart(), backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing intersect result");
      assertValidShape(occt, output.meta["shape"] as any, "intersect semantic edge result");

      const topEdge = result.final.selections.find(
        (selection) =>
          selection.kind === "edge" &&
          selection.meta["createdBy"] === "intersect-1" &&
          selection.meta["selectionSlot"] === "side.1.bound.top"
      );
      assert.ok(topEdge, "missing side.1.bound.top edge");
      assert.equal(topEdge.id, "edge:body.main~intersect-1.side.1.bound.top");

      const bottomEdge = result.final.selections.find(
        (selection) =>
          selection.kind === "edge" &&
          selection.meta["createdBy"] === "intersect-1" &&
          selection.meta["selectionSlot"] === "side.1.bound.bottom"
      );
      assert.ok(bottomEdge, "missing side.1.bound.bottom edge");
      assert.equal(bottomEdge.id, "edge:body.main~intersect-1.side.1.bound.bottom");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
