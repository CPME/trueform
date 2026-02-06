import { dsl } from "../dsl.js";

export const viewerPart = dsl.part("viewer-all-features", [
  dsl.sketch2d("sketch-base", [
    { name: "profile:base", profile: dsl.profileRect(80, 40) },
  ]),
  dsl.extrude(
    "base-extrude",
    dsl.profileRef("profile:base"),
    10,
    "body:base",
    ["sketch-base"]
  ),
  dsl.hole(
    "through-hole",
    dsl.selectorFace(
      [dsl.predCreatedBy("base-extrude"), dsl.predPlanar()],
      [dsl.rankMaxZ()]
    ),
    "-Z",
    8,
    "throughAll",
    { deps: ["base-extrude"] }
  ),
  dsl.fillet(
    "hole-fillet",
    dsl.selectorEdge([dsl.predCreatedBy("through-hole")]),
    1.5,
    ["through-hole"]
  ),
  dsl.extrude(
    "boss-extrude",
    dsl.profileRect(30, 20, [10, 0, 0]),
    6,
    "body:boss"
  ),
  dsl.booleanOp(
    "union-base",
    "union",
    dsl.selectorNamed("body:base"),
    dsl.selectorNamed("body:boss"),
    "body:merged",
    ["hole-fillet", "boss-extrude"]
  ),
  dsl.revolve(
    "spindle",
    dsl.profileRect(2, 4, [1, 2, 0]),
    "+X",
    "full",
    "body:spindle"
  ),
  dsl.booleanOp(
    "union-spindle",
    "union",
    dsl.selectorNamed("body:merged"),
    dsl.selectorNamed("body:spindle"),
    "body:main",
    ["hole-fillet", "spindle"]
  ),
]);
