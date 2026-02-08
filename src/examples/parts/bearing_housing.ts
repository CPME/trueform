import { part, withTags } from "../../dsl/core.js";
import {
  hole,
  predPlanar,
  profileRef,
  profileSketchLoop,
  rankMaxArea,
  revolve,
  selectorFace,
  sketch2d,
  sketchLine,
} from "../../dsl/geometry.js";
import type { PartDefinition } from "./types.js";

export const bearingHousing: PartDefinition = {
  id: "bearing-housing",
  title: "Bearing Housing (Revolve + Counterbore)",
  sourcePath: "src/examples/parts/bearing_housing.ts",
  part: part("bearing-housing", [
    sketch2d(
      "sketch-housing",
      [
        {
          name: "profile:housing",
          profile: profileSketchLoop([
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
          ]),
        },
      ],
      {
        entities: [
          sketchLine("h1", [0, 0], [0, 20]),
          sketchLine("h2", [0, 20], [6, 20]),
          sketchLine("h3", [6, 20], [6, 14]),
          sketchLine("h4", [6, 14], [26, 14]),
          sketchLine("h5", [26, 14], [26, 0]),
          sketchLine("h6", [26, 0], [0, 0]),
        ],
      }
    ),
    withTags(
      revolve(
        "housing-revolve",
        profileRef("profile:housing"),
        "+X",
        "full",
        "body:main",
        { deps: ["sketch-housing"] }
      ),
      ["housing"]
    ),
    withTags(
      hole(
        "bearing-bore",
        selectorFace([predPlanar()], [rankMaxArea()]),
        "+X",
        10,
        "throughAll",
        {
          counterbore: { diameter: 18, depth: 6 },
          deps: ["housing-revolve"],
        }
      ),
      ["counterbore", "bearing-seat"]
    ),
  ]),
};
