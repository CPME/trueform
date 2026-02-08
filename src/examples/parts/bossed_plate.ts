import { part, withTags } from "../../dsl/core.js";
import {
  booleanOp,
  extrude,
  profileCircle,
  profileRect,
  selectorNamed,
} from "../../dsl/geometry.js";
import type { PartDefinition } from "./types.js";

export const bossedPlate: PartDefinition = {
  id: "bossed-plate",
  title: "Bossed Plate (Union + Hole)",
  sourcePath: "src/examples/parts/bossed_plate.ts",
  part: part("bossed-plate", [
    withTags(
      extrude("base", profileRect(100, 70), 12, "body:base"),
      ["base-plate"]
    ),
    withTags(
      extrude(
        "boss",
        profileCircle(16, [25, 15, 0]),
        24,
        "body:boss"
      ),
      ["boss"]
    ),
    withTags(
      booleanOp(
        "boss-union",
        "union",
        selectorNamed("body:base"),
        selectorNamed("body:boss"),
        "body:bossed",
        ["base", "boss"]
      ),
      ["union"]
    ),
    withTags(
      extrude(
        "boss-bore-tool",
        profileCircle(5, [25, 15, 0]),
        30,
        "body:boss-bore-tool"
      ),
      ["bore"]
    ),
    withTags(
      booleanOp(
        "boss-bore-cut",
        "subtract",
        selectorNamed("body:bossed"),
        selectorNamed("body:boss-bore-tool"),
        "body:main",
        ["boss-union", "boss-bore-tool"]
      ),
      ["bore"]
    ),
  ]),
};
