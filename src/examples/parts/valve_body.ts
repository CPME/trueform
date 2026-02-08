import { part, withTags } from "../../dsl/core.js";
import {
  booleanOp,
  extrude,
  profileCircle,
  profileRect,
  selectorNamed,
} from "../../dsl/geometry.js";
import type { PartDefinition } from "./types.js";

export const valveBody: PartDefinition = {
  id: "valve-body",
  title: "Valve Body (Boss + Pocket + Port)",
  sourcePath: "src/examples/parts/valve_body.ts",
  part: part("valve-body", [
    withTags(
      extrude("base", profileRect(120, 80), 50, "body:base"),
      ["body"]
    ),
    withTags(
      extrude(
        "top-boss",
        profileCircle(20, [0, 0, 50]),
        25,
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
        "body:merged",
        ["base", "top-boss"]
      ),
      ["union"]
    ),
    extrude(
      "bore-tool",
      profileCircle(11, [0, 0, -5]),
      85,
      "body:bore-tool"
    ),
    withTags(
      booleanOp(
        "bore-cut",
        "subtract",
        selectorNamed("body:merged"),
        selectorNamed("body:bore-tool"),
        "body:with-bore",
        ["boss-union", "bore-tool"]
      ),
      ["main-bore"]
    ),
    extrude(
      "side-port-tool",
      profileCircle(6, [35, 0, -5]),
      85,
      "body:side-port"
    ),
    withTags(
      booleanOp(
        "side-port-cut",
        "subtract",
        selectorNamed("body:with-bore"),
        selectorNamed("body:side-port"),
        "body:with-ports",
        ["bore-cut", "side-port-tool"]
      ),
      ["port"]
    ),
    extrude(
      "pocket-tool",
      profileRect(70, 50, [0, 0, 25]),
      20,
      "body:pocket"
    ),
    withTags(
      booleanOp(
        "pocket-cut",
        "subtract",
        selectorNamed("body:with-ports"),
        selectorNamed("body:pocket"),
        "body:main",
        ["side-port-cut", "pocket-tool"]
      ),
      ["pocket"]
    ),
  ]),
};
