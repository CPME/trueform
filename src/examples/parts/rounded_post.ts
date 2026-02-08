import { part, withTags } from "../../dsl/core.js";
import {
  extrude,
  fillet,
  predCreatedBy,
  profileCircle,
  selectorEdge,
} from "../../dsl/geometry.js";
import type { PartDefinition } from "./types.js";

export const roundedPost: PartDefinition = {
  id: "rounded-post",
  title: "Rounded Post (Filleted Cylinder)",
  sourcePath: "src/examples/parts/rounded_post.ts",
  part: part("rounded-post", [
    withTags(
      extrude("post", profileCircle(18), 40, "body:main"),
      ["post"]
    ),
    withTags(
      fillet(
        "post-fillet",
        selectorEdge([predCreatedBy("post")]),
        2,
        ["post"]
      ),
      ["edge-fillet"]
    ),
  ]),
};
