import assert from "node:assert/strict";
import {
  dsl,
  Sketch2D,
  SketchLine,
  SketchEllipse,
  SketchPolygon,
  SketchSpline,
  SketchSlot,
} from "../dsl.js";
import { normalizePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "sketch primitives: normalize scalar fields",
    fn: async () => {
      const part = dsl.part("sketch-primitives", [
        dsl.sketch2d(
          "sketch-base",
          [],
          {
            entities: [
              dsl.sketchLine(
                "line-1",
                [dsl.exprLiteral(1, "in"), 0],
                [0, dsl.exprLiteral(10, "mm")]
              ),
              dsl.sketchArc(
                "arc-1",
                [0, 0],
                [dsl.exprLiteral(1, "cm"), 0],
                [0, dsl.exprLiteral(1, "cm")],
                "cw"
              ),
              dsl.sketchCircle(
                "circle-1",
                [0, 0],
                dsl.exprLiteral(2, "cm")
              ),
              dsl.sketchEllipse(
                "ellipse-1",
                [0, 0],
                dsl.exprLiteral(10, "mm"),
                dsl.exprLiteral(5, "mm"),
                { rotation: dsl.exprLiteral(90, "deg") }
              ),
              dsl.sketchRectCenter(
                "rect-center",
                [0, 0],
                dsl.exprLiteral(20, "mm"),
                dsl.exprLiteral(10, "mm")
              ),
              dsl.sketchRectCorner(
                "rect-corner",
                [dsl.exprLiteral(5, "mm"), dsl.exprLiteral(6, "mm")],
                dsl.exprLiteral(2, "cm"),
                dsl.exprLiteral(1, "cm")
              ),
              dsl.sketchSlot(
                "slot-1",
                [0, 0],
                dsl.exprLiteral(10, "mm"),
                dsl.exprLiteral(2, "mm"),
                { rotation: dsl.exprLiteral(180, "deg") }
              ),
              dsl.sketchPolygon(
                "poly-1",
                [0, 0],
                dsl.exprLiteral(1, "cm"),
                dsl.exprLiteral(6),
                { rotation: dsl.exprLiteral(30, "deg") }
              ),
              dsl.sketchSpline(
                "spline-1",
                [[0, 0], [dsl.exprLiteral(1, "cm"), 0]],
                { degree: dsl.exprLiteral(3) }
              ),
              dsl.sketchPoint(
                "point-1",
                [dsl.exprLiteral(5, "mm"), dsl.exprLiteral(10, "mm")]
              ),
            ],
          }
        ),
      ]);

      const normalized = normalizePart(part);
      const sketch = normalized.features[0] as Sketch2D;
      const byId = new Map(
        (sketch.entities ?? []).map((entity) => [entity.id, entity])
      );

      const line = byId.get("line-1") as SketchLine;
      assert.ok(Math.abs((line.start[0] as number) - 25.4) < 1e-6);
      assert.equal(line.end[1] as number, 10);

      const ellipse = byId.get("ellipse-1") as SketchEllipse;
      assert.ok(
        Math.abs(((ellipse.rotation ?? 0) as number) - Math.PI / 2) < 1e-6
      );

      const slot = byId.get("slot-1") as SketchSlot;
      assert.ok(Math.abs(((slot.rotation ?? 0) as number) - Math.PI) < 1e-6);

      const polygon = byId.get("poly-1") as SketchPolygon;
      assert.equal(polygon.sides as number, 6);

      const spline = byId.get("spline-1") as SketchSpline;
      assert.equal(spline.degree as number, 3);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
