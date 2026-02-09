import { exprLiteral, part } from "../dsl/core.js";
import {
  sketch2d,
  sketchArc,
  sketchCircle,
  sketchEllipse,
  sketchLine,
  sketchPolygon,
  sketchRectCenter,
  sketchRectCorner,
  sketchSlot,
  sketchSpline,
} from "../dsl/geometry.js";

export const sketchPrimitivesPart = part("sketch-primitives", [
  sketch2d("sketch-1", [], {
    entities: [
      sketchLine("line-1", [-40, -30], [40, -30]),
      sketchArc("arc-1", [20, 0], [0, 20], [0, 0], "ccw"),
      sketchCircle("circle-1", [0, 0], exprLiteral(12, "mm")),
      sketchEllipse(
        "ellipse-1",
        [30, 20],
        exprLiteral(14, "mm"),
        exprLiteral(6, "mm"),
        { rotation: exprLiteral(25, "deg") }
      ),
      sketchRectCenter(
        "rect-center",
        [-10, 15],
        exprLiteral(30, "mm"),
        exprLiteral(18, "mm"),
        { rotation: exprLiteral(15, "deg") }
      ),
      sketchRectCorner(
        "rect-corner",
        [15, -10],
        exprLiteral(24, "mm"),
        exprLiteral(12, "mm"),
        { rotation: exprLiteral(-10, "deg") }
      ),
      sketchSlot(
        "slot-1",
        [-30, 20],
        exprLiteral(28, "mm"),
        exprLiteral(8, "mm"),
        { rotation: exprLiteral(-20, "deg") }
      ),
      sketchPolygon(
        "poly-1",
        [-30, -10],
        exprLiteral(10, "mm"),
        exprLiteral(6),
        { rotation: exprLiteral(10, "deg") }
      ),
      sketchSpline(
        "spline-1",
        [
          [-10, -5],
          [0, 12],
          [15, 8],
          [25, -6],
        ],
        { closed: false }
      ),
      sketchLine("construction-1", [-40, 0], [40, 0], {
        construction: true,
      }),
    ],
  }),
]);
