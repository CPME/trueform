import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { assertValidShape, countFaces, getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt parity probe: trim surface preserves deterministic split slot naming",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("trim-surface-probe", [
        dsl.plane("sheet", 20, 20, "surface:sheet", {
          origin: [0, 0, 3],
        }),
        dsl.extrude("tool", dsl.profileRect(8, 8), 6, "body:tool"),
        dsl.trimSurface(
          "trim-1",
          dsl.selectorNamed("surface:sheet"),
          [dsl.selectorNamed("body:tool")],
          "surface:trim",
          undefined,
          { keep: "outside" }
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:trim");
      assert.ok(output, "missing trim output");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing trim shape");
      assertValidShape(occt, shape, "trim surface result");
      assert.ok(countFaces(occt, shape) >= 1, "expected trimmed surface to keep at least one face");

      const faces = result.final.selections.filter(
        (selection) =>
          selection.kind === "face" && selection.meta["createdBy"] === "trim-1"
      );
      assert.equal(faces.length, 1, `expected one trimmed face selection, got ${faces.length}`);
      const [trimmed] = faces;
      assert.equal(trimmed?.meta["selectionSlot"], "split.seed.branch.1");
      assert.equal(trimmed?.id, "face:surface.trim~trim-1.split.seed.branch.1");
    },
  },
  {
    name: "occt parity probe: extend surface preserves source face slot naming",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("extend-surface-probe", [
        dsl.datumPlane("side-plane", "+Y"),
        dsl.plane("sheet", 10, 8, "surface:sheet", {
          plane: dsl.planeDatum("side-plane"),
          deps: ["side-plane"],
        }),
        dsl.extendSurface(
          "extend-1",
          dsl.selectorNamed("surface:sheet"),
          dsl.selectorEdge([dsl.predCreatedBy("sheet")], [dsl.rankMaxZ()]),
          3,
          "surface:extended"
        ),
      ]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("surface:extended");
      assert.ok(output, "missing extend output");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing extend shape");
      assertValidShape(occt, shape, "extend surface result");
      assert.equal(countFaces(occt, shape), 1, "expected extended surface to remain a single face");

      const faces = result.final.selections.filter(
        (selection) =>
          selection.kind === "face" && selection.meta["createdBy"] === "extend-1"
      );
      assert.equal(faces.length, 1, `expected one extended face selection, got ${faces.length}`);
      const [extended] = faces;
      assert.equal(extended?.meta["selectionSlot"], "seed");
      assert.equal(extended?.id, "face:surface.extended~extend-1.seed");
    },
  },
  {
    name: "occt parity probe: knit preserves semantic merge slots across repeated runs",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("knit-surface-probe", [
        dsl.extrude("base", dsl.profileRect(20, 12), 8, "body:main"),
        dsl.knit(
          "knit-1",
          [
            dsl.selectorFace([dsl.predCreatedBy("base"), dsl.predPlanar()], [dsl.rankMaxZ()]),
            dsl.selectorFace([dsl.predCreatedBy("base"), dsl.predNormal("+X")]),
          ],
          "surface:knit"
        ),
      ]);

      const first = buildPart(part, backend);
      const second = buildPart(part, backend);
      const output = first.final.outputs.get("surface:knit");
      assert.ok(output, "missing knit output");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing knit shape");
      assertValidShape(occt, shape, "knit result");
      assert.equal(countFaces(occt, shape), 2, "expected knit result to keep two source faces");

      const sideSource = first.final.selections.find(
        (selection) =>
          selection.kind === "face" &&
          selection.meta["createdBy"] === "base" &&
          selection.meta["normal"] === "+X"
      );
      assert.ok(sideSource, "missing +X source face selection");
      const sideSlot = sideSource?.meta["selectionSlot"];
      assert.equal(typeof sideSlot, "string");

      const firstFaces = first.final.selections
        .filter(
          (selection) =>
            selection.kind === "face" && selection.meta["createdBy"] === "knit-1"
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      const secondFaces = second.final.selections
        .filter(
          (selection) =>
            selection.kind === "face" && selection.meta["createdBy"] === "knit-1"
        )
        .sort((a, b) => a.id.localeCompare(b.id));

      assert.deepEqual(
        firstFaces.map((selection) => selection.id),
        secondFaces.map((selection) => selection.id),
        "expected knit face ids to stay deterministic across repeated runs"
      );
      assert.deepEqual(
        firstFaces
          .map((selection) => String(selection.meta["selectionSlot"]))
          .sort(),
        [`merge.part.1.top`, `merge.part.2.${String(sideSlot)}`].sort(),
        "expected knit merge slots to preserve source semantic names"
      );
      assert.deepEqual(
        firstFaces.map((selection) => String(selection.meta["selectionSlot"])),
        secondFaces.map((selection) => String(selection.meta["selectionSlot"])),
        "expected knit merge slots to stay deterministic across repeated runs"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
