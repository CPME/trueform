# Tolerancing Examples

## Cosmetic Thread

```ts
const target = refSurface(selectorFace([predCreatedBy("base")], [rankMaxArea()]));

const examplePart = part("example-thread-cosmetic", [
  extrude("base", profileCircle(10), 24, "body:main"),
], {
  cosmeticThreads: [
    cosmeticThread("thread-1", target, {
      designation: "M8x1.25-6H",
      internal: true,
      length: 12,
    }),
  ],
});
```

Notes:
- Cosmetic threads are preferred for most cases; they propagate to PMI and STEP AP242.

## Tolerancing PMI Sidecar

The example below defines datum features and applies a small set of basic
constraints (flatness, parallelism, perpendicularity, position, size) plus a
surface profile constraint. This is data-only in v1 but is intended to flow
from DSL -> IR -> PMI export (AP242 sidecar today).

![Tolerancing example](/examples/dsl/tolerancing.iso.png)

```ts
import { dsl, buildPart } from "trueform";
import { exportStepAp242WithPmi } from "trueform/export";

const topFace = dsl.selectorFace(
  [dsl.predPlanar(), dsl.predNormal("+Z")],
  [dsl.rankMaxZ()]
);
const bottomFace = dsl.selectorFace(
  [dsl.predPlanar(), dsl.predNormal("-Z")],
  [dsl.rankMinZ()]
);

const sideFace = dsl.selectorFace([dsl.predPlanar(), dsl.predNormal("+X")]);

const base = dsl.extrude(
  "base",
  dsl.profileRect(120, 70),
  12,
  "body:main"
);
const hole = dsl.hole("hole-1", topFace, "-Z", 10, "throughAll", {
  deps: ["base"],
});
const holeFace = dsl.selectorFace(
  [dsl.predCreatedBy("hole-1")],
  [dsl.rankMaxArea()]
);

const part = dsl.part("example-tolerancing", [base, hole], {
  datums: [
    dsl.datumFeature("datum-A", "A", dsl.refSurface(bottomFace)),
    dsl.datumFeature("datum-B", "B", dsl.refSurface(sideFace)),
  ],
  constraints: [
    dsl.flatnessConstraint("flat-top", dsl.refSurface(topFace), 0.05, {
      requirement: "req-flat-top",
    }),
    dsl.parallelismConstraint(
      "parallel-top",
      dsl.refSurface(topFace),
      0.08,
      [dsl.datumRef("datum-A")]
    ),
    dsl.perpendicularityConstraint(
      "perp-side",
      dsl.refSurface(sideFace),
      0.1,
      [dsl.datumRef("datum-A")]
    ),
    dsl.positionConstraint(
      "pos-hole",
      dsl.refAxis(holeFace),
      0.2,
      [dsl.datumRef("datum-A"), dsl.datumRef("datum-B")],
      { zone: "diameter", modifiers: ["MMC"] }
    ),
    dsl.sizeConstraint("size-hole", dsl.refAxis(holeFace), {
      nominal: 10,
      tolerance: 0.1,
      modifiers: ["MMC"],
    }),
    dsl.surfaceProfileConstraint("profile-top", dsl.refSurface(topFace), 0.03, {
      referenceFrame: dsl.refFrame(topFace),
      requirement: "req-profile-top",
      capabilities: ["mill-3axis"],
    }),
  ],
});

// After building with a backend:
// const { step, pmi } = exportStepAp242WithPmi(backend, body, part, { schema: "AP242" });
```

Example PMI JSON (sidecar emitted alongside AP242 STEP):

```json
{
  "schema": "trueform.pmi.v1",
  "partId": "example-tolerancing",
  "datums": [
    {
      "id": "datum-A",
      "kind": "datum.feature",
      "label": "A",
      "target": {
        "kind": "ref.surface",
        "selector": {
          "kind": "selector.face",
          "predicates": [
            { "kind": "pred.planar" },
            { "kind": "pred.normal", "value": "-Z" }
          ],
          "rank": [{ "kind": "rank.minZ" }]
        }
      }
    },
    {
      "id": "datum-B",
      "kind": "datum.feature",
      "label": "B",
      "target": {
        "kind": "ref.surface",
        "selector": {
          "kind": "selector.face",
          "predicates": [
            { "kind": "pred.planar" },
            { "kind": "pred.normal", "value": "+X" }
          ],
          "rank": []
        }
      }
    }
  ],
  "constraints": [
    {
      "id": "flat-top",
      "kind": "constraint.flatness",
      "target": {
        "kind": "ref.surface",
        "selector": {
          "kind": "selector.face",
          "predicates": [
            { "kind": "pred.planar" },
            { "kind": "pred.normal", "value": "+Z" }
          ],
          "rank": [{ "kind": "rank.maxZ" }]
        }
      },
      "tolerance": 0.05,
      "requirement": "req-flat-top"
    },
    {
      "id": "parallel-top",
      "kind": "constraint.parallelism",
      "target": {
        "kind": "ref.surface",
        "selector": {
          "kind": "selector.face",
          "predicates": [
            { "kind": "pred.planar" },
            { "kind": "pred.normal", "value": "+Z" }
          ],
          "rank": [{ "kind": "rank.maxZ" }]
        }
      },
      "tolerance": 0.08,
      "datum": [{ "kind": "datum.ref", "datum": "datum-A" }]
    },
    {
      "id": "pos-hole",
      "kind": "constraint.position",
      "target": {
        "kind": "ref.axis",
        "selector": {
          "kind": "selector.face",
          "predicates": [{ "kind": "pred.createdBy", "featureId": "hole-1" }],
          "rank": [{ "kind": "rank.maxArea" }]
        }
      },
      "tolerance": 0.2,
      "datum": [
        { "kind": "datum.ref", "datum": "datum-A" },
        { "kind": "datum.ref", "datum": "datum-B" }
      ],
      "modifiers": ["MMC"],
      "zone": "diameter"
    },
    {
      "id": "profile-top",
      "kind": "constraint.surfaceProfile",
      "target": {
        "kind": "ref.surface",
        "selector": {
          "kind": "selector.face",
          "predicates": [
            { "kind": "pred.planar" },
            { "kind": "pred.normal", "value": "+Z" }
          ],
          "rank": [{ "kind": "rank.maxZ" }]
        }
      },
      "tolerance": 0.03,
      "referenceFrame": {
        "kind": "ref.frame",
        "selector": {
          "kind": "selector.face",
          "predicates": [
            { "kind": "pred.planar" },
            { "kind": "pred.normal", "value": "+Z" }
          ],
          "rank": [{ "kind": "rank.maxZ" }]
        }
      },
      "requirement": "req-profile-top",
      "capabilities": ["mill-3axis"]
    }
  ]
}
```

Rendered PMI example file:
`docs/public/examples/pmi/tolerancing.pmi.json` (served at `/examples/pmi/tolerancing.pmi.json`).
