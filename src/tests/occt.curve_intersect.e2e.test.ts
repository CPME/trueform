import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countEdges,
  countFaces,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

function makeCurvedSectionPart(cutPlaneOrigin: [number, number, number]) {
  const line = dsl.sketchLine("line-1", [10, 0], [10, 16]);
  const sketch = dsl.sketch2d(
    "sketch-cylinder",
    [
      {
        name: "profile:wall",
        profile: dsl.profileSketchLoop(["line-1"], { open: true }),
      },
    ],
    {
      plane: dsl.planeDatum("sketch-plane"),
      entities: [line],
    }
  );
  return dsl.part("curve-intersect-part", [
    dsl.datumPlane("sketch-plane", "+Y"),
    sketch,
    dsl.revolve(
      "surface-revolve",
      dsl.profileRef("profile:wall"),
      "+Z",
      "full",
      "surface:cylinder",
      { mode: "surface" }
    ),
    dsl.datumPlane("cut-plane", dsl.axisVector([0, 1, 1]), cutPlaneOrigin),
    dsl.plane("cut-face", 80, 80, "surface:cut", {
      plane: dsl.planeDatum("cut-plane"),
      deps: ["cut-plane"],
    }),
    dsl.curveIntersect(
      "curve-intersect-1",
      dsl.selectorNamed("surface:cylinder"),
      dsl.selectorNamed("surface:cut"),
      "curve:main"
    ),
  ]);
}

const tests = [
  {
    name: "occt e2e: curve intersect between a cylindrical surface and angled plane produces a stable edge output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const result = buildPart(makeCurvedSectionPart([0, 0, 8]), backend);
      const output = result.final.outputs.get("curve:main");
      assert.ok(output, "missing curve output");
      assert.equal(output.kind, "edge");
      assert.equal(output.id, "edge:curve.main~curve-intersect-1.curve.1");

      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing curve shape metadata");
      assertValidShape(occt, shape, "curve intersect output");
      assert.equal(countEdges(occt, shape), 1);
      assert.equal(countFaces(occt, shape), 0);
      assert.equal(countSolids(occt, shape), 0);
      assert.equal(output.meta["closedEdge"], false);
      assert.equal(output.meta["curveType"], "ellipse");

      const edgeSelections = result.final.selections.filter(
        (selection) => selection.kind === "edge" && selection.meta["ownerKey"] === "curve:main"
      );
      assert.equal(edgeSelections.length, 1);
      assert.equal(edgeSelections[0]?.id, output.id);
    },
  },
  {
    name: "occt e2e: curve intersect reports no intersection when the surfaces do not meet",
    fn: async () => {
      const { backend } = await getBackendContext();
      assert.throws(
        () => buildPart(makeCurvedSectionPart([0, 0, 40]), backend),
        /curve_intersect_no_intersection/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
