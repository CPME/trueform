import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { assertValidShape, getBackendContext, runTests } from "./occt_test_utils.js";

function buildSubtractSplitTopChannelPart() {
  return dsl.part("boolean-split-lineage-subtract", [
    dsl.extrude("base", dsl.profileRect(20, 20), 12, "body:left"),
    dsl.extrude("tool-seed", dsl.profileRect(24, 8), 6, "body:tool-seed"),
    dsl.moveBody("tool-move", dsl.selectorNamed("body:tool-seed"), "body:right", ["tool-seed"], {
      translation: [0, 0, 8],
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

function buildSubtractSplitSideChannelPart() {
  return dsl.part("boolean-split-lineage-side-subtract", [
    dsl.extrude("base", dsl.profileRect(20, 20), 12, "body:left"),
    dsl.extrude("tool-seed", dsl.profileRect(12, 8), 6, "body:tool-seed"),
    dsl.moveBody("tool-move", dsl.selectorNamed("body:tool-seed"), "body:right", ["tool-seed"], {
      rotationAxis: "+Y",
      rotationAngle: Math.PI / 2,
      translation: [10, 0, 6],
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
    name: "occt boolean split lineage: subtract emits split branch slots for preserved cap faces",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const result = buildPart(buildSubtractSplitTopChannelPart(), backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing subtract split result");
      assertValidShape(occt, output.meta["shape"] as any, "subtract split lineage result");

      const topBranches = result.final.selections
        .filter(
          (selection) =>
            selection.kind === "face" &&
            selection.meta["createdBy"] === "subtract-1" &&
            typeof selection.meta["selectionSlot"] === "string" &&
            /^split\.top\.branch\.\d+$/.test(selection.meta["selectionSlot"] as string)
        )
        .map((selection) => selection.id)
        .sort();
      assert.deepEqual(topBranches, [
        "face:body.main~subtract-1.split.top.branch.1",
        "face:body.main~subtract-1.split.top.branch.2",
      ]);
    },
  },
  {
    name: "occt boolean split lineage: subtract propagates split branch slots into semantic edge ids",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const result = buildPart(buildSubtractSplitTopChannelPart(), backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing subtract split result");
      assertValidShape(occt, output.meta["shape"] as any, "subtract split semantic edge result");

      const edgeIds = result.final.selections
        .filter(
          (selection) =>
            selection.kind === "edge" && selection.meta["createdBy"] === "subtract-1"
        )
        .map((selection) => selection.id);

      assert.equal(
        edgeIds.some((id) => /\.bound\.split\.top\.branch\.1(?:\.part\.\d+)?$/.test(id)),
        true,
        "missing semantic edge referencing split.top.branch.1"
      );
      assert.equal(
        edgeIds.some((id) => /\.bound\.split\.top\.branch\.2(?:\.part\.\d+)?$/.test(id)),
        true,
        "missing semantic edge referencing split.top.branch.2"
      );
    },
  },
  {
    name: "occt boolean split lineage: subtract emits split branch slots for preserved side faces",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const result = buildPart(buildSubtractSplitSideChannelPart(), backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing subtract side split result");
      assertValidShape(occt, output.meta["shape"] as any, "subtract side split lineage result");

      const sideBranches = result.final.selections
        .filter(
          (selection) =>
            selection.kind === "face" &&
            selection.meta["createdBy"] === "subtract-1" &&
            typeof selection.meta["selectionSlot"] === "string" &&
            /^split\.side\.2\.branch\.\d+$/.test(selection.meta["selectionSlot"] as string)
        )
        .map((selection) => selection.id)
        .sort();
      assert.deepEqual(sideBranches, [
        "face:body.main~subtract-1.split.side.2.branch.1",
        "face:body.main~subtract-1.split.side.2.branch.2",
      ]);
    },
  },
  {
    name: "occt boolean split lineage: subtract propagates split side branch slots into semantic edge ids",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const result = buildPart(buildSubtractSplitSideChannelPart(), backend);
      const output = result.final.outputs.get("body:main");
      assert.ok(output, "missing subtract side split result");
      assertValidShape(occt, output.meta["shape"] as any, "subtract side split semantic edge result");

      const edgeIds = result.final.selections
        .filter(
          (selection) =>
            selection.kind === "edge" && selection.meta["createdBy"] === "subtract-1"
        )
        .map((selection) => selection.id);

      assert.equal(
        edgeIds.some((id) => /\.bound\.split\.side\.2\.branch\.1(?:\.part\.\d+)?$/.test(id)),
        true,
        "missing semantic edge referencing split.side.2.branch.1"
      );
      assert.equal(
        edgeIds.some((id) => /\.bound\.split\.side\.2\.branch\.2(?:\.part\.\d+)?$/.test(id)),
        true,
        "missing semantic edge referencing split.side.2.branch.2"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
