import { part, withTags } from "../../dsl/core.js";
import {
  booleanOp,
  extrude,
  profileRef,
  profileRect,
  profileSketchLoop,
  revolve,
  selectorNamed,
  sketch2d,
  sketchLine,
} from "../../dsl/geometry.js";
import type { PartDefinition } from "./types.js";

export const impellerHub: PartDefinition = {
  id: "impeller-hub",
  title: "Impeller Hub (Revolve + Slot Cuts)",
  sourcePath: "src/examples/parts/impeller_hub.ts",
  part: part("impeller-hub", [
    sketch2d(
      "sketch-impeller",
      [
        {
          name: "profile:impeller",
          profile: profileSketchLoop([
            "i1",
            "i2",
            "i3",
            "i4",
            "i5",
            "i6",
            "i7",
            "i8",
          ]),
        },
      ],
      {
        entities: [
          sketchLine("i1", [0, 0], [0, 12]),
          sketchLine("i2", [0, 12], [8, 12]),
          sketchLine("i3", [8, 12], [8, 22]),
          sketchLine("i4", [8, 22], [16, 22]),
          sketchLine("i5", [16, 22], [16, 8]),
          sketchLine("i6", [16, 8], [24, 8]),
          sketchLine("i7", [24, 8], [24, 0]),
          sketchLine("i8", [24, 0], [0, 0]),
        ],
      }
    ),
    withTags(
      revolve(
        "impeller-revolve",
        profileRef("profile:impeller"),
        "+X",
        "full",
        "body:impeller",
        { deps: ["sketch-impeller"] }
      ),
      ["hub"]
    ),
    extrude(
      "slot-tool-1",
      profileRect(6, 6, [14, 18, -15]),
      30,
      "body:slot-1"
    ),
    withTags(
      booleanOp(
        "slot-cut-1",
        "subtract",
        selectorNamed("body:impeller"),
        selectorNamed("body:slot-1"),
        "body:slot-a",
        ["impeller-revolve", "slot-tool-1"]
      ),
      ["blade-slot"]
    ),
    extrude(
      "slot-tool-2",
      profileRect(6, 6, [14, -18, -15]),
      30,
      "body:slot-2"
    ),
    withTags(
      booleanOp(
        "slot-cut-2",
        "subtract",
        selectorNamed("body:slot-a"),
        selectorNamed("body:slot-2"),
        "body:slot-b",
        ["slot-cut-1", "slot-tool-2"]
      ),
      ["blade-slot"]
    ),
    extrude(
      "slot-tool-3",
      profileRect(6, 6, [18, 8, 10]),
      12,
      "body:slot-3"
    ),
    withTags(
      booleanOp(
        "slot-cut-3",
        "subtract",
        selectorNamed("body:slot-b"),
        selectorNamed("body:slot-3"),
        "body:slot-c",
        ["slot-cut-2", "slot-tool-3"]
      ),
      ["blade-slot"]
    ),
    extrude(
      "slot-tool-4",
      profileRect(6, 6, [18, -8, -20]),
      12,
      "body:slot-4"
    ),
    withTags(
      booleanOp(
        "slot-cut-4",
        "subtract",
        selectorNamed("body:slot-c"),
        selectorNamed("body:slot-4"),
        "body:main",
        ["slot-cut-3", "slot-tool-4"]
      ),
      ["blade-slot"]
    ),
  ]),
};
