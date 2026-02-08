import { part, withTags } from "../../dsl/core.js";
import {
  extrude,
  hole,
  predPlanar,
  profileRect,
  rankMaxZ,
  selectorFace,
} from "../../dsl/geometry.js";
import type { PartDefinition } from "./types.js";

export const plateHole: PartDefinition = {
  id: "plate-hole",
  title: "Plate With Center Hole",
  sourcePath: "src/examples/parts/plate_hole.ts",
  part: part("plate-hole", [
    withTags(
      extrude("plate", profileRect(90, 50), 12, "body:main"),
      ["plate"]
    ),
    withTags(
      hole(
        "center-hole",
        selectorFace([predPlanar()], [rankMaxZ()]),
        "-Z",
        18,
        "throughAll",
        { deps: ["plate"] }
      ),
      ["through-hole"]
    ),
  ]),
};
