import { dsl } from "../dsl.js";
import type { IntentPart } from "../dsl.js";

export type DslFeatureExample = {
  id: string;
  title: string;
  part: IntentPart;
};

export const dslFeatureExamples: DslFeatureExample[] = [
  {
    id: "extrude",
    title: "Extrude",
    part: dsl.part("example-extrude", [
      dsl.extrude("base", dsl.profileRect(80, 50), 12, "body:main"),
    ]),
  },
  {
    id: "revolve",
    title: "Revolve",
    part: dsl.part("example-revolve", [
      dsl.revolve(
        "ring-revolve",
        dsl.profileRect(3, 6, [1.5, 3, 0]),
        "+X",
        "full",
        "body:main"
      ),
    ]),
  },
  {
    id: "hole",
    title: "Hole",
    part: dsl.part("example-hole", [
      dsl.extrude("base", dsl.profileRect(90, 50), 12, "body:main"),
      dsl.hole(
        "hole-1",
        dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()]),
        "-Z",
        14,
        "throughAll",
        { deps: ["base"] }
      ),
    ]),
  },
  {
    id: "fillet",
    title: "Fillet",
    part: dsl.part("example-fillet", [
      dsl.extrude("cyl", dsl.profileCircle(14), 28, "body:main"),
      dsl.fillet(
        "edge-fillet",
        dsl.selectorEdge([dsl.predCreatedBy("cyl")], [dsl.rankMaxZ()]),
        3,
        ["cyl"]
      ),
    ]),
  },
  {
    id: "boolean",
    title: "Boolean Union",
    part: dsl.part("example-boolean", [
      dsl.extrude("base", dsl.profileRect(50, 26), 12, "body:base"),
      dsl.extrude(
        "tool",
        dsl.profileRect(26, 26, [12, 0, 0]),
        12,
        "body:tool"
      ),
      dsl.booleanOp(
        "union-1",
        "union",
        dsl.selectorNamed("body:base"),
        dsl.selectorNamed("body:tool"),
        "body:main",
        ["base", "tool"]
      ),
    ]),
  },
];
