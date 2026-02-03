import { buildPart, MockBackend, PartIR, Selector } from "../index.js";

const topFace: Selector = {
  kind: "selector.face",
  predicates: [
    { kind: "pred.planar" },
    { kind: "pred.normal", value: "+Z" },
  ],
  rank: [{ kind: "rank.maxArea" }],
};

const part: PartIR = {
  id: "plate",
  features: [
    {
      id: "datum-top",
      kind: "datum.plane",
      normal: "+Z",
    },
    {
      id: "base-extrude",
      kind: "feature.extrude",
      profile: { kind: "profile.rectangle", width: 100, height: 60 },
      depth: 6,
      result: "body:main",
      deps: ["datum-top"],
    },
    {
      id: "hole-1",
      kind: "feature.hole",
      onFace: topFace,
      axis: "+Z",
      diameter: 5,
      depth: "throughAll",
      deps: ["base-extrude"],
    },
  ],
};

const backend = new MockBackend();
const built = buildPart(part, backend);
console.log(JSON.stringify(built, null, 2));
