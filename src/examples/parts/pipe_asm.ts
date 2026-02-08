import {
  exprAdd,
  exprLiteral,
  exprParam,
  exprSub,
  paramLength,
  part,
  withTags,
} from "../../dsl/core.js";
import {
  booleanOp,
  pathArc,
  pathSegments,
  pipe,
  pipeSweep,
  selectorNamed,
} from "../../dsl/geometry.js";
import type { PartDefinition } from "./types.js";

const p = exprParam;
const lit = (value: number) => exprLiteral(value, "mm");
const add = exprAdd;
const sub = exprSub;

const MAIN_OUTER = p("main_outer_dia");
const MAIN_INNER = p("main_inner_dia");
const MAIN_HEIGHT = p("main_height");
const BASE_FLANGE_OD = p("base_flange_od");
const BASE_FLANGE_THK = p("base_flange_thk");

const HUB_DIAMETER = p("hub_dia");
const HUB_LENGTH = p("hub_length");
const HUB_OFFSET_Z = p("hub_offset_z");

const HORIZ_OUTER = p("horiz_outer_dia");
const HORIZ_INNER = p("horiz_inner_dia");
const HORIZ_LENGTH = p("horiz_length");
const HORIZ_FLANGE_OD = p("horiz_flange_od");
const HORIZ_FLANGE_THK = p("horiz_flange_thk");

const TOP_OUTER = p("top_outer_dia");
const TOP_INNER = p("top_inner_dia");
const TOP_LENGTH = p("top_length");
const TOP_FLANGE_OD = p("top_flange_od");
const TOP_FLANGE_THK = p("top_flange_thk");

const ELBOW_RADIUS = p("elbow_radius");
const ELBOW_CENTER_Z = p("elbow_center_z");

const HUB_ORIGIN_Z = sub(ELBOW_CENTER_Z, HUB_OFFSET_Z);
const ELBOW_TOP_Z = add(ELBOW_CENTER_Z, ELBOW_RADIUS);
const TOP_FLANGE_ORIGIN_Z = add(ELBOW_TOP_Z, TOP_LENGTH);

export const pipeAsm: PartDefinition = {
  id: "pipe-asm",
  title: "Pipe Assembly (Elbow + Flanges)",
  sourcePath: "src/examples/parts/pipe_asm.ts",
  part: part(
    "pipe-asm",
    [
      withTags(
        pipe(
          "vertical-pipe",
          "+Z",
          MAIN_HEIGHT,
          MAIN_OUTER,
          MAIN_INNER,
          "body:vertical"
        ),
        ["pipe", "vertical"]
      ),
      withTags(
        pipe(
          "base-flange",
          "+Z",
          BASE_FLANGE_THK,
          BASE_FLANGE_OD,
          MAIN_INNER,
          "body:base-flange"
        ),
        ["flange", "base"]
      ),
      withTags(
        pipe(
          "hub-band",
          "+Z",
          HUB_LENGTH,
          HUB_DIAMETER,
          MAIN_INNER,
          "body:hub",
          { origin: [0, 0, HUB_ORIGIN_Z] }
        ),
        ["hub"]
      ),
      withTags(
        pipe(
          "horiz-pipe",
          "+X",
          HORIZ_LENGTH,
          HORIZ_OUTER,
          HORIZ_INNER,
          "body:horiz",
          { origin: [0, 0, ELBOW_CENTER_Z] }
        ),
        ["pipe", "horizontal"]
      ),
      withTags(
        pipe(
          "horiz-flange",
          "+X",
          HORIZ_FLANGE_THK,
          HORIZ_FLANGE_OD,
          HORIZ_INNER,
          "body:horiz-flange",
          { origin: [HORIZ_LENGTH, 0, ELBOW_CENTER_Z] }
        ),
        ["flange", "horizontal"]
      ),
      withTags(
        pipeSweep(
          "elbow-sweep",
          pathSegments([
            pathArc(
              [0, 0, ELBOW_CENTER_Z],
              [ELBOW_RADIUS, 0, ELBOW_TOP_Z],
              [0, 0, ELBOW_TOP_Z],
              "ccw"
            ),
          ]),
          HORIZ_OUTER,
          HORIZ_INNER,
          "body:elbow"
        ),
        ["pipe", "elbow"]
      ),
      withTags(
        pipe(
          "top-pipe",
          "+Z",
          TOP_LENGTH,
          TOP_OUTER,
          TOP_INNER,
          "body:top",
          { origin: [ELBOW_RADIUS, 0, ELBOW_TOP_Z] }
        ),
        ["pipe", "top"]
      ),
      withTags(
        pipe(
          "top-flange",
          "+Z",
          TOP_FLANGE_THK,
          TOP_FLANGE_OD,
          TOP_INNER,
          "body:top-flange",
          { origin: [ELBOW_RADIUS, 0, TOP_FLANGE_ORIGIN_Z] }
        ),
        ["flange", "top"]
      ),
      withTags(
        booleanOp(
          "union-vertical",
          "union",
          selectorNamed("body:vertical"),
          selectorNamed("body:base-flange"),
          "body:vertical-union",
          ["vertical-pipe", "base-flange"]
        ),
        ["union"]
      ),
      withTags(
        booleanOp(
          "union-hub",
          "union",
          selectorNamed("body:vertical-union"),
          selectorNamed("body:hub"),
          "body:core",
          ["union-vertical", "hub-band"]
        ),
        ["union"]
      ),
      withTags(
        booleanOp(
          "union-horiz",
          "union",
          selectorNamed("body:core"),
          selectorNamed("body:horiz"),
          "body:core-horiz",
          ["union-hub", "horiz-pipe"]
        ),
        ["union"]
      ),
      withTags(
        booleanOp(
          "union-horiz-flange",
          "union",
          selectorNamed("body:core-horiz"),
          selectorNamed("body:horiz-flange"),
          "body:core-horiz-flange",
          ["union-horiz", "horiz-flange"]
        ),
        ["union"]
      ),
      withTags(
        booleanOp(
          "union-elbow",
          "union",
          selectorNamed("body:core-horiz-flange"),
          selectorNamed("body:elbow"),
          "body:core-elbow",
          ["union-horiz-flange", "elbow-sweep"]
        ),
        ["union"]
      ),
      withTags(
        booleanOp(
          "union-top",
          "union",
          selectorNamed("body:core-elbow"),
          selectorNamed("body:top"),
          "body:core-top",
          ["union-elbow", "top-pipe"]
        ),
        ["union"]
      ),
      withTags(
        booleanOp(
          "union-top-flange",
          "union",
          selectorNamed("body:core-top"),
          selectorNamed("body:top-flange"),
          "body:main",
          ["union-top", "top-flange"]
        ),
        ["union"]
      ),
    ],
    {
      params: [
        paramLength("main_outer_dia", lit(80)),
        paramLength("main_inner_dia", lit(60)),
        paramLength("main_height", lit(100)),
        paramLength("base_flange_od", lit(90)),
        paramLength("base_flange_thk", lit(10)),
        paramLength("hub_dia", lit(80)),
        paramLength("hub_length", lit(40)),
        paramLength("hub_offset_z", lit(20)),
        paramLength("horiz_outer_dia", lit(50)),
        paramLength("horiz_inner_dia", lit(40)),
        paramLength("horiz_length", lit(85)),
        paramLength("horiz_flange_od", lit(90)),
        paramLength("horiz_flange_thk", lit(20)),
        paramLength("top_outer_dia", lit(50)),
        paramLength("top_inner_dia", lit(40)),
        paramLength("top_length", lit(50)),
        paramLength("top_flange_od", lit(70)),
        paramLength("top_flange_thk", lit(10)),
        paramLength("elbow_radius", lit(58)),
        paramLength("elbow_center_z", p("main_height")),
      ],
    }
  ),
};
