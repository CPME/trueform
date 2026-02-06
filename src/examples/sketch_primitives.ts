import { dsl } from "../dsl.js";

export const sketchPrimitivesPart = dsl.part("sketch-primitives", [
  dsl.sketch2d("sketch-1", [], {
    entities: [
      dsl.sketchLine("line-1", [-40, -30], [40, -30]),
      dsl.sketchArc("arc-1", [20, 0], [0, 20], [0, 0], "ccw"),
      dsl.sketchCircle("circle-1", [0, 0], dsl.exprLiteral(12, "mm")),
      dsl.sketchEllipse(
        "ellipse-1",
        [30, 20],
        dsl.exprLiteral(14, "mm"),
        dsl.exprLiteral(6, "mm"),
        { rotation: dsl.exprLiteral(25, "deg") }
      ),
      dsl.sketchRectCenter(
        "rect-center",
        [-10, 15],
        dsl.exprLiteral(30, "mm"),
        dsl.exprLiteral(18, "mm"),
        { rotation: dsl.exprLiteral(15, "deg") }
      ),
      dsl.sketchRectCorner(
        "rect-corner",
        [15, -10],
        dsl.exprLiteral(24, "mm"),
        dsl.exprLiteral(12, "mm"),
        { rotation: dsl.exprLiteral(-10, "deg") }
      ),
      dsl.sketchSlot(
        "slot-1",
        [-30, 20],
        dsl.exprLiteral(28, "mm"),
        dsl.exprLiteral(8, "mm"),
        { rotation: dsl.exprLiteral(-20, "deg") }
      ),
      dsl.sketchPolygon(
        "poly-1",
        [-30, -10],
        dsl.exprLiteral(10, "mm"),
        dsl.exprLiteral(6),
        { rotation: dsl.exprLiteral(10, "deg") }
      ),
      dsl.sketchSpline(
        "spline-1",
        [
          [-10, -5],
          [0, 12],
          [15, 8],
          [25, -6],
        ],
        { closed: false }
      ),
      dsl.sketchPoint("point-1", [5, 25]),
      dsl.sketchLine("construction-1", [-40, 0], [40, 0], {
        construction: true,
      }),
    ],
  }),
]);
