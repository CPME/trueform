import { dsl } from "../dsl.js";
import type { IntentPart } from "../dsl.js";

export type SketchFeatureExample = {
  id: string;
  title: string;
  part: IntentPart;
};

export const sketchFeatureExamples: SketchFeatureExample[] = [
  {
    id: "line",
    title: "Line",
    part: dsl.part("sketch-line", [
      dsl.sketch2d("sketch-line", [], {
        entities: [dsl.sketchLine("line-1", [-40, -20], [40, 20])],
      }),
    ]),
  },
  {
    id: "arc",
    title: "Arc",
    part: dsl.part("sketch-arc", [
      dsl.sketch2d("sketch-arc", [], {
        entities: [dsl.sketchArc("arc-1", [30, 0], [0, 30], [0, 0], "ccw")],
      }),
    ]),
  },
  {
    id: "circle",
    title: "Circle",
    part: dsl.part("sketch-circle", [
      dsl.sketch2d("sketch-circle", [], {
        entities: [dsl.sketchCircle("circle-1", [0, 0], 22)],
      }),
    ]),
  },
  {
    id: "ellipse",
    title: "Ellipse",
    part: dsl.part("sketch-ellipse", [
      dsl.sketch2d("sketch-ellipse", [], {
        entities: [
          dsl.sketchEllipse("ellipse-1", [0, 0], 26, 12, {
            rotation: dsl.exprLiteral(20, "deg"),
          }),
        ],
      }),
    ]),
  },
  {
    id: "rect-center",
    title: "Rectangle (Center)",
    part: dsl.part("sketch-rect-center", [
      dsl.sketch2d("sketch-rect-center", [], {
        entities: [
          dsl.sketchRectCenter("rect-center", [0, 0], 60, 32, {
            rotation: dsl.exprLiteral(10, "deg"),
          }),
        ],
      }),
    ]),
  },
  {
    id: "rect-corner",
    title: "Rectangle (Corner)",
    part: dsl.part("sketch-rect-corner", [
      dsl.sketch2d("sketch-rect-corner", [], {
        entities: [
          dsl.sketchRectCorner("rect-corner", [-25, -12], 60, 30, {
            rotation: dsl.exprLiteral(-8, "deg"),
          }),
        ],
      }),
    ]),
  },
  {
    id: "slot",
    title: "Slot",
    part: dsl.part("sketch-slot", [
      dsl.sketch2d("sketch-slot", [], {
        entities: [
          dsl.sketchSlot("slot-1", [0, 0], 70, 16, {
            rotation: dsl.exprLiteral(12, "deg"),
          }),
        ],
      }),
    ]),
  },
  {
    id: "polygon",
    title: "Polygon",
    part: dsl.part("sketch-polygon", [
      dsl.sketch2d("sketch-polygon", [], {
        entities: [dsl.sketchPolygon("poly-1", [0, 0], 24, 6)],
      }),
    ]),
  },
  {
    id: "spline",
    title: "Spline",
    part: dsl.part("sketch-spline", [
      dsl.sketch2d("sketch-spline", [], {
        entities: [
          dsl.sketchSpline("spline-1", [
            [-30, -10],
            [-10, 20],
            [10, 10],
            [30, -15],
          ]),
        ],
      }),
    ]),
  },
  {
    id: "point",
    title: "Point",
    part: dsl.part("sketch-point", [
      dsl.sketch2d("sketch-point", [], {
        entities: [dsl.sketchPoint("point-1", [0, 0])],
      }),
    ]),
  },
];
