import { part, withTags } from "../../dsl/core.js";
import {
  booleanOp,
  extrude,
  hole,
  predNormal,
  predPlanar,
  profileRef,
  profileRect,
  profileSketchLoop,
  rankMaxArea,
  revolve,
  selectorFace,
  selectorNamed,
  sketch2d,
  sketchLine,
} from "../../dsl/geometry.js";
import type { PartDefinition } from "./types.js";

export const steppedPulley: PartDefinition = {
  id: "stepped-pulley",
  title: "Stepped Pulley (Revolve + Bore + Keyway)",
  sourcePath: "src/examples/parts/stepped_pulley.ts",
  part: part("stepped-pulley", [
    sketch2d(
      "sketch-pulley",
      [
        {
          name: "profile:pulley",
          profile: profileSketchLoop([
            "p1",
            "p2",
            "p3",
            "p4",
            "p5",
            "p6",
            "p7",
            "p8",
          ]),
        },
      ],
      {
        entities: [
          sketchLine("p1", [0, 0], [0, 12]),
          sketchLine("p2", [0, 12], [8, 12]),
          sketchLine("p3", [8, 12], [8, 20]),
          sketchLine("p4", [8, 20], [18, 20]),
          sketchLine("p5", [18, 20], [18, 8]),
          sketchLine("p6", [18, 8], [30, 8]),
          sketchLine("p7", [30, 8], [30, 0]),
          sketchLine("p8", [30, 0], [0, 0]),
        ],
      }
    ),
    withTags(
      revolve(
        "pulley-revolve",
        profileRef("profile:pulley"),
        "+X",
        "full",
        "body:pulley",
        { deps: ["sketch-pulley"] }
      ),
      ["pulley"]
    ),
    withTags(
      hole(
        "bore-hole",
        selectorFace(
          [predPlanar(), predNormal("+X")],
          [rankMaxArea()]
        ),
        "-X",
        8,
        "throughAll",
        { deps: ["pulley-revolve"] }
      ),
      ["bore"]
    ),
    extrude(
      "keyway-tool",
      profileRect(16, 6, [15, 0, -25]),
      50,
      "body:keyway-tool"
    ),
    withTags(
      booleanOp(
        "keyway-cut",
        "subtract",
        selectorNamed("body:pulley"),
        selectorNamed("body:keyway-tool"),
        "body:main",
        ["bore-hole", "keyway-tool"]
      ),
      ["keyway"]
    ),
  ]),
};
