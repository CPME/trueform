import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { assertValidShape, getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: extrude ellipse and spline sketch loops",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("sketch-curves", [
        dsl.sketch2d(
          "sketch-ellipse",
          [
            {
              name: "profile:ellipse",
              profile: dsl.profileSketchLoop(["ellipse-1"]),
            },
          ],
          {
            entities: [dsl.sketchEllipse("ellipse-1", [0, 0], 20, 10, { rotation: 0 })],
          }
        ),
        dsl.extrude(
          "extrude-ellipse",
          dsl.profileRef("profile:ellipse"),
          6,
          "body:ellipse",
          ["sketch-ellipse"]
        ),
        dsl.sketch2d(
          "sketch-spline",
          [
            {
              name: "profile:spline",
              profile: dsl.profileSketchLoop(["spline-1"]),
            },
          ],
          {
            entities: [
              dsl.sketchSpline(
                "spline-1",
                [
                  [0, 0],
                  [20, 0],
                  [20, 20],
                  [0, 20],
                ],
                { closed: true }
              ),
            ],
          }
        ),
        dsl.extrude(
          "extrude-spline",
          dsl.profileRef("profile:spline"),
          4,
          "body:spline",
          ["sketch-spline"]
        ),
      ]);

      const result = buildPart(part, backend);
      const ellipseBody = result.final.outputs.get("body:ellipse");
      assert.ok(ellipseBody, "missing body:ellipse output");
      const splineBody = result.final.outputs.get("body:spline");
      assert.ok(splineBody, "missing body:spline output");

      assertValidShape(occt, ellipseBody.meta["shape"], "ellipse extrude solid");
      assertValidShape(occt, splineBody.meta["shape"], "spline extrude solid");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
