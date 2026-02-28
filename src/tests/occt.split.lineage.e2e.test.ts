import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { assertValidShape, getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt split lineage: split face emits deterministic branch slots",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("split-face-lineage", [
        dsl.extrude("base", dsl.profileRect(20, 12), 8, "body:main"),
        dsl.datumPlane("split-datum", "+X", [0, 0, 0]),
        dsl.plane("splitter", 24, 16, "surface:splitter", {
          plane: dsl.planeDatum("split-datum"),
          origin: [0, 0, 4],
          deps: ["split-datum", "base"],
        }),
        dsl.splitFace(
          "split-top",
          dsl.selectorNamed("face:body.main~base.top"),
          dsl.selectorNamed("surface:splitter"),
          "body:split",
          ["base", "splitter"]
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:split");
      assert.ok(output, "missing split-face result");
      assertValidShape(occt, output.meta["shape"] as any, "split-face lineage result");

      const branches = result.final.selections
        .filter(
          (selection) =>
            selection.kind === "face" &&
            selection.meta["createdBy"] === "split-top" &&
            typeof selection.meta["selectionSlot"] === "string" &&
            (selection.meta["selectionSlot"] as string).startsWith("split.top.branch.")
        )
        .sort((a, b) =>
          String(a.meta["selectionSlot"]).localeCompare(String(b.meta["selectionSlot"]))
        );
      assert.equal(branches.length, 2, "expected two split-top branch faces");
      assert.deepEqual(
        branches.map((selection) => selection.id),
        [
          "face:body.split~split-top.split.top.branch.1",
          "face:body.split~split-top.split.top.branch.2",
        ]
      );
      for (const [index, selection] of branches.entries()) {
        assert.deepEqual(selection.meta["selectionLineage"], {
          kind: "split",
          from: "face:body.main~base.top",
          branch: `${index + 1}`,
        });
      }

      const branchX = branches.map((selection) => {
        const center = selection.meta["center"];
        return Array.isArray(center) && center.length === 3 ? Number(center[0]) : NaN;
      });
      const firstBranchX = branchX[0] ?? Number.NaN;
      const secondBranchX = branchX[1] ?? Number.NaN;
      assert.ok(
        Number.isFinite(firstBranchX) &&
          Number.isFinite(secondBranchX) &&
          firstBranchX <= secondBranchX,
        `expected branch ordering to be left-to-right, got x=${branchX.join(", ")}`
      );
    },
  },
  {
    name: "occt split lineage: split body preserves unchanged bottom face slot",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("split-body-lineage", [
        dsl.extrude("base", dsl.profileRect(20, 12), 8, "body:main"),
        dsl.plane("splitter", 24, 16, "surface:splitter", {
          origin: [0, 0, 4],
          deps: ["base"],
        }),
        dsl.splitBody(
          "split-body",
          dsl.selectorNamed("body:main"),
          dsl.selectorNamed("surface:splitter"),
          "body:split",
          ["base", "splitter"]
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:split");
      assert.ok(output, "missing split-body result");
      assertValidShape(occt, output.meta["shape"] as any, "split-body lineage result");

      const bottom = result.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "split-body" &&
          selection.meta["selectionSlot"] === "bottom"
      );
      assert.ok(bottom, "missing preserved split-body bottom face");
      assert.equal(bottom.id, "face:body.split~split-body.bottom");
      assert.deepEqual(bottom.meta["selectionLineage"], {
        kind: "modified",
        from: "face:body.main~base.bottom",
      });
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
