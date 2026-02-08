import { part, withTags } from "../../dsl/core.js";
import {
  booleanOp,
  extrude,
  profileCircle,
  profileRect,
  selectorNamed,
} from "../../dsl/geometry.js";
import type { PartDefinition } from "./types.js";

export const tSlotCarriage: PartDefinition = {
  id: "t-slot-carriage",
  title: "T-Slot Carriage (Multi-Stage Cuts)",
  sourcePath: "src/examples/parts/t_slot_carriage.ts",
  part: part("t-slot-carriage", [
    withTags(
      extrude("base", profileRect(120, 60), 30, "body:base"),
      ["carriage"]
    ),
    extrude(
      "slot-top-tool",
      profileRect(80, 14, [0, 0, -5]),
      40,
      "body:slot-top"
    ),
    withTags(
      booleanOp(
        "slot-cut-1",
        "subtract",
        selectorNamed("body:base"),
        selectorNamed("body:slot-top"),
        "body:slot-1",
        ["base", "slot-top-tool"]
      ),
      ["t-slot"]
    ),
    extrude(
      "slot-bottom-tool",
      profileRect(60, 26, [0, 0, -10]),
      20,
      "body:slot-bottom"
    ),
    withTags(
      booleanOp(
        "slot-cut-2",
        "subtract",
        selectorNamed("body:slot-1"),
        selectorNamed("body:slot-bottom"),
        "body:slot-2",
        ["slot-cut-1", "slot-bottom-tool"]
      ),
      ["t-slot"]
    ),
    extrude(
      "bolt-tool-1",
      profileCircle(6, [40, 20, -5]),
      40,
      "body:bolt-1"
    ),
    withTags(
      booleanOp(
        "bolt-cut-1",
        "subtract",
        selectorNamed("body:slot-2"),
        selectorNamed("body:bolt-1"),
        "body:slot-3",
        ["slot-cut-2", "bolt-tool-1"]
      ),
      ["mount-hole"]
    ),
    extrude(
      "bolt-tool-2",
      profileCircle(6, [-40, 20, -5]),
      40,
      "body:bolt-2"
    ),
    withTags(
      booleanOp(
        "bolt-cut-2",
        "subtract",
        selectorNamed("body:slot-3"),
        selectorNamed("body:bolt-2"),
        "body:slot-4",
        ["bolt-cut-1", "bolt-tool-2"]
      ),
      ["mount-hole"]
    ),
    extrude(
      "bolt-tool-3",
      profileCircle(6, [40, -20, -5]),
      40,
      "body:bolt-3"
    ),
    withTags(
      booleanOp(
        "bolt-cut-3",
        "subtract",
        selectorNamed("body:slot-4"),
        selectorNamed("body:bolt-3"),
        "body:slot-5",
        ["bolt-cut-2", "bolt-tool-3"]
      ),
      ["mount-hole"]
    ),
    extrude(
      "bolt-tool-4",
      profileCircle(6, [-40, -20, -5]),
      40,
      "body:bolt-4"
    ),
    withTags(
      booleanOp(
        "bolt-cut-4",
        "subtract",
        selectorNamed("body:slot-5"),
        selectorNamed("body:bolt-4"),
        "body:main",
        ["bolt-cut-3", "bolt-tool-4"]
      ),
      ["mount-hole"]
    ),
  ]),
};
