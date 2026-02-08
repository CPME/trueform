import { part, withTags } from "../../dsl/core.js";
import {
  booleanOp,
  extrude,
  profileCircle,
  profileRect,
  profileRef,
  profileSketchLoop,
  selectorNamed,
  sketch2d,
  sketchLine,
} from "../../dsl/geometry.js";
import type { PartDefinition } from "./types.js";

export const lBracketCutout: PartDefinition = {
  id: "l-bracket-cutout",
  title: "L-Bracket With Cutouts",
  sourcePath: "src/examples/parts/l_bracket_cutout.ts",
  part: part("l-bracket-cutout", [
    sketch2d(
      "sketch-bracket",
      [
        {
          name: "profile:l",
          profile: profileSketchLoop([
            "line-1",
            "line-2",
            "line-3",
            "line-4",
            "line-5",
            "line-6",
          ]),
        },
      ],
      {
        entities: [
          sketchLine("line-1", [0, 0], [90, 0]),
          sketchLine("line-2", [90, 0], [90, 20]),
          sketchLine("line-3", [90, 20], [40, 20]),
          sketchLine("line-4", [40, 20], [40, 60]),
          sketchLine("line-5", [40, 60], [0, 60]),
          sketchLine("line-6", [0, 60], [0, 0]),
        ],
      }
    ),
    withTags(
      extrude(
        "bracket-extrude",
        profileRef("profile:l"),
        15,
        "body:bracket",
        ["sketch-bracket"]
      ),
      ["bracket"]
    ),
    extrude(
      "slot-tool",
      profileRect(18, 8, [20, 40, 0]),
      15,
      "body:slot-tool"
    ),
    withTags(
      booleanOp(
        "slot-cut",
        "subtract",
        selectorNamed("body:bracket"),
        selectorNamed("body:slot-tool"),
        "body:bracket-slot",
        ["bracket-extrude", "slot-tool"]
      ),
      ["slot"]
    ),
    extrude(
      "hole-tool",
      profileCircle(6, [70, 10, 0]),
      15,
      "body:hole-tool"
    ),
    withTags(
      booleanOp(
        "hole-cut",
        "subtract",
        selectorNamed("body:bracket-slot"),
        selectorNamed("body:hole-tool"),
        "body:main",
        ["slot-cut", "hole-tool"]
      ),
      ["mount-hole"]
    ),
  ]),
};
