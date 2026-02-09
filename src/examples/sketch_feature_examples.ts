import { exprLiteral, part } from "../dsl/core.js";
import type { IntentPart } from "../dsl.js";
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
import { sketchArray } from "../dsl/generators.js";

export type SketchFeatureExample = {
  id: string;
  title: string;
  part: IntentPart;
};

export const sketchFeatureExamples: SketchFeatureExample[] = [
  {
    id: "line",
    title: "Line",
    part: part("sketch-line", [
      sketch2d("sketch-line", [], {
        entities: [sketchLine("line-1", [-40, -20], [40, 20])],
      }),
    ]),
  },
  {
    id: "arc",
    title: "Arc",
    part: part("sketch-arc", [
      sketch2d("sketch-arc", [], {
        entities: [sketchArc("arc-1", [30, 0], [0, 30], [0, 0], "ccw")],
      }),
    ]),
  },
  {
    id: "circle",
    title: "Circle",
    part: part("sketch-circle", [
      sketch2d("sketch-circle", [], {
        entities: [sketchCircle("circle-1", [0, 0], 22)],
      }),
    ]),
  },
  {
    id: "ellipse",
    title: "Ellipse",
    part: part("sketch-ellipse", [
      sketch2d("sketch-ellipse", [], {
        entities: [
          sketchEllipse("ellipse-1", [0, 0], 26, 12, {
            rotation: exprLiteral(20, "deg"),
          }),
        ],
      }),
    ]),
  },
  {
    id: "rect-center",
    title: "Rectangle (Center)",
    part: part("sketch-rect-center", [
      sketch2d("sketch-rect-center", [], {
        entities: [
          sketchRectCenter("rect-center", [0, 0], 60, 32, {
            rotation: exprLiteral(10, "deg"),
          }),
        ],
      }),
    ]),
  },
  {
    id: "rect-corner",
    title: "Rectangle (Corner)",
    part: part("sketch-rect-corner", [
      sketch2d("sketch-rect-corner", [], {
        entities: [
          sketchRectCorner("rect-corner", [-25, -12], 60, 30, {
            rotation: exprLiteral(-8, "deg"),
          }),
        ],
      }),
    ]),
  },
  {
    id: "slot",
    title: "Slot",
    part: part("sketch-slot", [
      sketch2d("sketch-slot", [], {
        entities: [
          sketchSlot("slot-1", [0, 0], 70, 16, {
            rotation: exprLiteral(12, "deg"),
          }),
        ],
      }),
    ]),
  },
  {
    id: "polygon",
    title: "Polygon",
    part: part("sketch-polygon", [
      sketch2d("sketch-polygon", [], {
        entities: [sketchPolygon("poly-1", [0, 0], 24, 6)],
      }),
    ]),
  },
  {
    id: "spline",
    title: "Spline",
    part: part("sketch-spline", [
      sketch2d("sketch-spline", [], {
        entities: [
          sketchSpline("spline-1", [
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
    id: "rect-array",
    title: "Rectangle Array",
    part: part("sketch-rect-array", [
      sketch2d("sketch-rect-array", [], {
        entities: sketchArray(
          { count: [3, 2], spacing: [28, 18], origin: [-28, -9] },
          ({ index, offset }) =>
            sketchRectCenter(`rect-${index}`, offset, 18, 10)
        ),
      }),
    ]),
  },
];
