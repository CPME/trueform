import { part, withTags } from "../../dsl/core.js";
import {
  booleanOp,
  extrude,
  hole,
  predNormal,
  predPlanar,
  profileRect,
  rankMaxArea,
  selectorFace,
  selectorNamed,
} from "../../dsl/geometry.js";
import type { PartDefinition } from "./types.js";

export const hingeKnuckle: PartDefinition = {
  id: "hinge-knuckle",
  title: "Hinge Knuckle (Gaps + Pin Bore)",
  sourcePath: "src/examples/parts/hinge_knuckle.ts",
  part: part("hinge-knuckle", [
    withTags(
      extrude("base", profileRect(100, 30), 20, "body:base"),
      ["hinge-leaf"]
    ),
    extrude(
      "gap-tool-1",
      profileRect(18, 40, [-20, 0, -5]),
      30,
      "body:gap-1"
    ),
    withTags(
      booleanOp(
        "gap-cut-1",
        "subtract",
        selectorNamed("body:base"),
        selectorNamed("body:gap-1"),
        "body:gap-a",
        ["base", "gap-tool-1"]
      ),
      ["knuckle-gap"]
    ),
    extrude(
      "gap-tool-2",
      profileRect(18, 40, [20, 0, -5]),
      30,
      "body:gap-2"
    ),
    withTags(
      booleanOp(
        "gap-cut-2",
        "subtract",
        selectorNamed("body:gap-a"),
        selectorNamed("body:gap-2"),
        "body:main",
        ["gap-cut-1", "gap-tool-2"]
      ),
      ["knuckle-gap"]
    ),
    withTags(
      hole(
        "pin-bore",
        selectorFace(
          [predPlanar(), predNormal("+Y")],
          [rankMaxArea()]
        ),
        "-Y",
        12,
        "throughAll",
        { deps: ["gap-cut-2"] }
      ),
      ["pin-bore"]
    ),
  ]),
};
