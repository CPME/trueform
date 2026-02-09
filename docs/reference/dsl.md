# DSL Reference

This page documents the current DSL helpers exported from `trueform`. The API is intentionally compact and data-first. For types, see `src/dsl.ts`.

## Import

```ts
import { context, document, part, exprLiteral } from "trueform/dsl/core";
import { sketch2d, extrude, surface, profileRect, profileRef } from "trueform/dsl/geometry";
import { assembly, instance, mateFixed } from "trueform/dsl/assembly";
import { refFrame, refSurface, surfaceProfileConstraint } from "trueform/dsl/tolerancing";
import { featureArray, sketchArray } from "trueform/dsl/generators";
```

If you prefer a single namespace, the `dsl` export is still available from `trueform`.

## Core: Document and Parts

- `context(overrides?) -> BuildContext`
- `document(id, parts, context?, assemblies?, opts?) -> IntentDocument`
- `part(id, features, opts?) -> IntentPart`

## Core: Parameters and Expressions

- `paramLength(id, value) -> ParamDef`
- `paramAngle(id, value) -> ParamDef`
- `paramCount(id, value) -> ParamDef`
- `exprLiteral(value, unit?) -> Expr`
- `exprParam(id) -> Expr`
- `exprAdd(left, right) -> Expr`
- `exprSub(left, right) -> Expr`
- `exprMul(left, right) -> Expr`
- `exprDiv(left, right) -> Expr`
- `exprNeg(value) -> Expr`

## Assembly (Data-Only in v1)

- `assembly(id, instances, opts?) -> IntentAssembly`
- `instance(id, part, transform?, tags?) -> AssemblyInstance`
- `transform(opts?) -> Transform`
- `ref(instance, connector) -> AssemblyRef`
- `mateFixed(a, b) -> AssemblyMate`
- `mateCoaxial(a, b) -> AssemblyMate`
- `matePlanar(a, b, offset?) -> AssemblyMate`
- `output(name, refs) -> AssemblyOutput`
- `connector(id, origin, opts?) -> MateConnector`

Assembly data remains the authoritative source, but `buildAssembly`/`solveAssembly`
can solve basic mates for now (fixed, coaxial, planar).

### Assembly Example

```ts
import { dsl, buildAssembly, buildPart, MockBackend } from "trueform";

const plate = dsl.part(
  "plate",
  [dsl.extrude("base", dsl.profileRect(40, 40), 6, "body:main")],
  {
    connectors: [
      dsl.mateConnector(
        "plate-top",
        dsl.selectorFace(
          [dsl.predPlanar(), dsl.predCreatedBy("base")],
          [dsl.rankMaxZ()]
        )
      ),
    ],
  }
);

const peg = dsl.part(
  "peg",
  [dsl.extrude("shaft", dsl.profileRect(12, 12), 20, "body:main")],
  {
    connectors: [
      dsl.mateConnector(
        "peg-bottom",
        dsl.selectorFace(
          [dsl.predPlanar(), dsl.predCreatedBy("shaft")],
          [dsl.rankMinZ()]
        )
      ),
    ],
  }
);

const assembly = dsl.assembly(
  "plate-peg",
  [
    dsl.assemblyInstance("plate-1", "plate"),
    dsl.assemblyInstance(
      "peg-1",
      "peg",
      dsl.transform({ translation: [20, 0, 20] })
    ),
  ],
  {
    mates: [
      dsl.mateCoaxial(
        dsl.assemblyRef("plate-1", "plate-top"),
        dsl.assemblyRef("peg-1", "peg-bottom")
      ),
      dsl.matePlanar(
        dsl.assemblyRef("plate-1", "plate-top"),
        dsl.assemblyRef("peg-1", "peg-bottom"),
        0
      ),
    ],
  }
);

const backend = new MockBackend();
const plateBuilt = buildPart(plate, backend);
const pegBuilt = buildPart(peg, backend);
const solved = buildAssembly(assembly, [plateBuilt, pegBuilt]);
```

## Tolerancing

- `refSurface(selector) -> RefSurface`
- `refFrame(selector) -> RefFrame`
- `refEdge(selector) -> RefEdge`
- `refAxis(selector) -> RefAxis`
- `refPoint(selector) -> RefPoint`
- `datumFeature(id, label, target, opts?) -> FTIDatum`
- `datumRef(datumId, modifiers?) -> DatumRef`
- `surfaceProfileConstraint(id, target, tolerance, opts?) -> SurfaceProfileConstraint`
- `flatnessConstraint(id, target, tolerance, opts?) -> FlatnessConstraint`
- `parallelismConstraint(id, target, tolerance, datumRefs, opts?) -> ParallelismConstraint`
- `perpendicularityConstraint(id, target, tolerance, datumRefs, opts?) -> PerpendicularityConstraint`
- `positionConstraint(id, target, tolerance, datumRefs, opts?) -> PositionConstraint`
- `sizeConstraint(id, target, opts) -> SizeConstraint`

### Tolerancing Example (PMI Sidecar)

The example below defines datum features and applies a small set of basic
tolerances (flatness, parallelism, perpendicularity, position, size) plus a
surface profile constraint. This is data-only in v1 but is intended to flow
from DSL → IR → PMI export (AP242 sidecar today).

![Tolerancing example](/examples/dsl/tolerancing.iso.png)

```ts
import { dsl, buildPart, exportStepAp242WithPmi } from "trueform";

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

## Geometry: Datums and Sketches

- `datumPlane(id, normal, origin?, deps?) -> DatumPlane`
- `datumAxis(id, direction, origin?, deps?) -> DatumAxis`
- `datumFrame(id, on, deps?) -> DatumFrame`
- `sketch2d(id, profiles, opts?) -> Sketch2D` (opts supports `entities`)

## Geometry: Sketch Primitives

- `sketchLine(id, start, end, opts?) -> SketchLine`
- `sketchArc(id, start, end, center, direction, opts?) -> SketchArc`
- `sketchCircle(id, center, radius, opts?) -> SketchCircle`
- `sketchEllipse(id, center, radiusX, radiusY, opts?) -> SketchEllipse`
- `sketchRectCenter(id, center, width, height, opts?) -> SketchRectangle`
- `sketchRectCorner(id, corner, width, height, opts?) -> SketchRectangle`
- `sketchSlot(id, center, length, width, opts?) -> SketchSlot`
- `sketchPolygon(id, center, radius, sides, opts?) -> SketchPolygon`
- `sketchSpline(id, points, opts?) -> SketchSpline`
- `sketchPoint(id, point, opts?) -> SketchPoint`

### Sketch Examples

The sketch examples below are rendered via `npm run docs:examples` and use
transparent backgrounds with light strokes for dark docs themes.

#### Line

![Line sketch](/examples/sketch/line.svg)

```ts
sketchLine("line-1", [-40, -20], [40, 20]);
```

#### Arc

![Arc sketch](/examples/sketch/arc.svg)

```ts
sketchArc("arc-1", [30, 0], [0, 30], [0, 0], "ccw");
```

#### Circle

![Circle sketch](/examples/sketch/circle.svg)

```ts
sketchCircle("circle-1", [0, 0], 22);
```

#### Ellipse

![Ellipse sketch](/examples/sketch/ellipse.svg)

```ts
sketchEllipse("ellipse-1", [0, 0], 26, 12, { rotation: exprLiteral(20, "deg") });
```

#### Rectangle (Center)

![Center rectangle sketch](/examples/sketch/rect-center.svg)

```ts
sketchRectCenter("rect-center", [0, 0], 60, 32, { rotation: exprLiteral(10, "deg") });
```

#### Rectangle (Corner)

![Corner rectangle sketch](/examples/sketch/rect-corner.svg)

```ts
sketchRectCorner("rect-corner", [-25, -12], 60, 30, { rotation: exprLiteral(-8, "deg") });
```

#### Slot

![Slot sketch](/examples/sketch/slot.svg)

```ts
sketchSlot("slot-1", [0, 0], 70, 16, { rotation: exprLiteral(12, "deg") });
```

#### Polygon

![Polygon sketch](/examples/sketch/polygon.svg)

```ts
sketchPolygon("poly-1", [0, 0], 24, 6);
```

#### Spline

![Spline sketch](/examples/sketch/spline.svg)

```ts
sketchSpline("spline-1", [
  [-30, -10],
  [-10, 20],
  [10, 10],
  [30, -15],
]);
```

## Profiles

- `profileRect(width, height, center?) -> Profile`
- `profileCircle(radius, center?) -> Profile`
- `profilePoly(sides, radius, center?, rotation?) -> Profile`
- `profileSketchLoop(loop, opts?) -> Profile`
- `profileRef(name) -> ProfileRef`

## Features

- `extrude(id, profile, depth, result?, deps?, opts?) -> Extrude`
- `surface(id, profile, result?, deps?) -> Surface`
- `revolve(id, profile, axis, angle, result?, opts?) -> Revolve`
- `loft(id, profiles, result?, deps?) -> Loft`
- `mirror(id, source, plane, result?, deps?) -> Mirror`
- `thicken(id, surface, thickness, result?, deps?, opts?) -> Thicken`
- `thread(id, axis, length, majorDiameter, pitch, result?, deps?, opts?) -> Thread`
- `hole(id, onFace, axis, diameter, depth, opts?) -> Hole`
- `fillet(id, edges, radius, deps?) -> Fillet`
- `chamfer(id, edges, distance, deps?) -> Chamfer`
- `booleanOp(id, op, left, right, result?, deps?) -> BooleanOp`

## Feature Examples

The examples below are rendered from OpenCascade.js output via
`npm run docs:examples`.

### Extrude

![Extrude example](/examples/dsl/extrude.iso.png)

```ts
const examplePart = part("example-extrude", [
  extrude("base", profileRect(80, 50), 12, "body:main"),
]);
```

Notes:
- Default output is `body:*` (mode `solid`).
- Use `extrude(..., { mode: "surface" })` to extrude a wire/profile into a surface output (`kind: "face"`).

### Surface

```ts
const rect = sketchRectCorner("rect-1", [0, 0], 40, 20);
const sketch = sketch2d(
  "sketch-face",
  [{ name: "profile:rect", profile: profileSketchLoop(["rect-1"]) }],
  { entities: [rect] }
);

const examplePart = part("example-surface", [
  sketch,
  surface("face-1", profileRef("profile:rect"), "surface:main"),
]);
```

### Revolve

![Revolve example](/examples/dsl/revolve.iso.png)

```ts
const examplePart = part("example-revolve", [
  revolve(
    "ring-revolve",
    profileRect(3, 6, [1.5, 3, 0]),
    "+X",
    "full",
    "body:main"
  ),
]);
```

Notes:
- Use `revolve(..., { mode: "surface" })` to revolve a wire/profile into a surface output (`kind: "face"`).

### Loft

![Loft example](/examples/dsl/loft.iso.png)

```ts
const examplePart = part("example-loft", [
  loft(
    "loft-1",
    [
      profileCircle(10, [0, 0, 0]),
      profilePoly(6, 16, [0, 0, 24], Math.PI / 6),
    ],
    "body:main"
  ),
]);
```

Notes:
- If either profile is an open sketch (e.g., `profileSketchLoop(..., { open: true })`), the loft outputs a surface (kind `face`) instead of a solid.

### Mirror

```ts
const examplePart = part("example-mirror", [
  extrude("base", profileRect(40, 20), 6, "body:base"),
  datumPlane("mirror-plane", "+X"),
  mirror(
    "mirror-1",
    selectorNamed("body:base"),
    planeDatum("mirror-plane"),
    "body:mirror"
  ),
]);
```

### Thicken

```ts
const rect = sketchRectCorner("rect-1", [0, 0], 40, 20);
const sketch = sketch2d(
  "sketch-face",
  [{ name: "profile:rect", profile: profileSketchLoop(["rect-1"]) }],
  { entities: [rect] }
);

const examplePart = part("example-thicken", [
  sketch,
  surface("face-1", profileRef("profile:rect"), "surface:main"),
  thicken("thicken-1", selectorNamed("surface:main"), 4, "body:main"),
]);
```

Notes:
- `thicken` currently expects a planar face.
- Use `{ direction: "reverse" }` to thicken opposite the face normal.

### Thread

```ts
const examplePart = part("example-thread", [
  thread("thread-1", "+Z", 12, 8, 1.5, "body:main", undefined, {
    minorDiameter: 6.5,
    segmentsPerTurn: 16,
  }),
]);
```

Notes:
- Use `booleanOp(..., "subtract", ...)` with a thread solid to cut internal threads.

### Hole

![Hole example](/examples/dsl/hole.iso.png)

```ts
const examplePart = part("example-hole", [
  extrude("base", profileRect(90, 50), 12, "body:main"),
  hole(
    "hole-1",
    selectorFace([predPlanar()], [rankMaxZ()]),
    "-Z",
    14,
    "throughAll",
    { deps: ["base"] }
  ),
]);
```

Counterbores and countersinks are optional via `counterbore` / `countersink`
in the options object (they are mutually exclusive). `countersink.angle` uses
radians; use `exprLiteral(82, "deg")` if you prefer degrees.

![Hole counterbore/countersink example](/examples/dsl/hole-advanced.iso.png)

```ts
const examplePart = part("example-hole-advanced", [
  extrude("base", profileRect(120, 50), 12, "body:main"),
  hole(
    "hole-counterbore",
    selectorFace([predPlanar()], [rankMaxZ()]),
    "-Z",
    8,
    "throughAll",
    {
      counterbore: { diameter: 16, depth: 4 },
      position: [-30, 0],
      deps: ["base"],
    }
  ),
  hole(
    "hole-countersink",
    selectorFace([predPlanar()], [rankMaxZ()]),
    "-Z",
    8,
    "throughAll",
    {
      countersink: { diameter: 18, angle: Math.PI / 2 },
      position: [30, 0],
      deps: ["hole-counterbore"],
    }
  ),
]);
```

### Fillet

![Fillet example](/examples/dsl/fillet.iso.png)

```ts
const examplePart = part("example-fillet", [
  extrude("cyl", profileCircle(14), 28, "body:main"),
  fillet(
    "edge-fillet",
    selectorEdge([predCreatedBy("cyl")], [rankMaxZ()]),
    3,
    ["cyl"]
  ),
]);
```

### Chamfer

![Chamfer example](/examples/dsl/chamfer.iso.png)

```ts
const examplePart = part("example-chamfer", [
  extrude("block", profileRect(40, 26), 12, "body:main"),
  chamfer(
    "edge-chamfer",
    selectorEdge([predCreatedBy("block")]),
    2,
    ["block"]
  ),
]);
```

### Boolean Union

![Boolean example](/examples/dsl/boolean.iso.png)

```ts
const examplePart = part("example-boolean", [
  extrude("base", profileRect(50, 26), 12, "body:base"),
  extrude(
    "tool",
    profileRect(26, 26, [12, 0, 0]),
    12,
    "body:tool"
  ),
  booleanOp(
    "union-1",
    "union",
    selectorNamed("body:base"),
    selectorNamed("body:tool"),
    "body:main",
    ["base", "tool"]
  ),
]);
```

## Patterns

- `patternLinear(id, origin, spacing, count, deps?) -> PatternLinear`
- `patternCircular(id, origin, axis, count, deps?) -> PatternCircular`

Pattern outputs are currently consumed by `hole(..., { pattern })` for layout; full feature/body patterns are future.

## Generators

- `featureArray(layout, make) -> IntentFeature[]`
- `sketchArray(layout, make) -> SketchEntity[] | SketchProfile[]`
- `featureCircularArray(layout, make) -> IntentFeature[]`
- `sketchCircularArray(layout, make) -> SketchEntity[] | SketchProfile[]`
- `featureRadialArray(layout, make) -> IntentFeature[]`
- `sketchRadialArray(layout, make) -> SketchEntity[] | SketchProfile[]`
- `featureArrayAlongSpline(layout, make) -> IntentFeature[]`
- `sketchArrayAlongSpline(layout, make) -> SketchEntity[] | SketchProfile[]`

Generators expand at authoring time. `count` is a fixed integer tuple `[cols, rows]`, while
`spacing` and `origin` accept `Scalar` values (numbers or expressions). Circular/radial
layouts require numeric angles and radius values because trigonometry is evaluated
immediately.

### Feature Array

![Feature array example](/examples/dsl/feature-array.iso.png)

```ts
const baseThickness = 6;
const bossHeight = 8;
const bossSize = 16;

const base = extrude(
  "base",
  profileRect(120, 80, [0, 0, 0]),
  baseThickness,
  "body:base"
);

const cubes = featureArray(
  { count: [3, 2], spacing: [36, 36], origin: [-36, -18, baseThickness] },
  ({ index, offset }) =>
    extrude(
      `cube-${index}`,
      profileRect(bossSize, bossSize, offset),
      bossHeight,
      `body:cube-${index}`
    )
);

const unions = [];
let current = "body:base";
for (let i = 0; i < cubes.length; i++) {
  const result = i === cubes.length - 1 ? "body:main" : `body:union-${i}`;
  unions.push(
    booleanOp(
      `union-${i}`,
      "union",
      selectorNamed(current),
      selectorNamed(`body:cube-${i}`),
      result
    )
  );
  current = result;
}

const examplePart = part("example-feature-array", [base, ...cubes, ...unions]);
```

### Sketch Array

![Sketch array example](/examples/sketch/rect-array.svg)

```ts
const exampleSketch = sketch2d("sketch-rect-array", [], {
  entities: sketchArray(
    { count: [3, 2], spacing: [28, 18], origin: [-28, -9] },
    ({ index, offset }) => sketchRectCenter(`rect-${index}`, offset, 18, 10)
  ),
});
```

### Circular Array

![Circular array example](/examples/dsl/circular-array.iso.png)

```ts
const baseThickness = 6;
const bossHeight = 8;
const bossRadius = 6;

const base = extrude(
  "base",
  profileRect(140, 100, [0, 0, 0]),
  baseThickness,
  "body:base"
);

const bosses = featureCircularArray(
  { count: 8, radius: 36, center: [0, 0, baseThickness], units: "deg" },
  ({ index, offset }) =>
    extrude(
      `boss-${index}`,
      profileCircle(bossRadius, offset),
      bossHeight,
      `body:boss-${index}`
    )
);

const unions = [];
let current = "body:base";
for (let i = 0; i < bosses.length; i++) {
  const result = i === bosses.length - 1 ? "body:main" : `body:union-${i}`;
  unions.push(
    booleanOp(
      `union-${i}`,
      "union",
      selectorNamed(current),
      selectorNamed(`body:boss-${i}`),
      result
    )
  );
  current = result;
}

const examplePart = part("example-circular-array", [base, ...bosses, ...unions]);
```

### Radial Array

![Radial array example](/examples/dsl/radial-array.iso.png)

```ts
const baseThickness = 6;
const bossHeight = 8;
const bossSize = 10;

const base = extrude(
  "base",
  profileRect(160, 110, [0, 0, 0]),
  baseThickness,
  "body:base"
);

const bosses = featureRadialArray(
  {
    count: [6, 3],
    radiusStep: 18,
    radiusStart: 18,
    center: [0, 0, baseThickness],
    angleStep: 60,
    units: "deg",
  },
  ({ index, offset }) =>
    extrude(
      `boss-${index}`,
      profileRect(bossSize, bossSize, offset),
      bossHeight,
      `body:boss-${index}`
    )
);

const unions = [];
let current = "body:base";
for (let i = 0; i < bosses.length; i++) {
  const result = i === bosses.length - 1 ? "body:main" : `body:union-${i}`;
  unions.push(
    booleanOp(
      `union-${i}`,
      "union",
      selectorNamed(current),
      selectorNamed(`body:boss-${i}`),
      result
    )
  );
  current = result;
}

const examplePart = part("example-radial-array", [base, ...bosses, ...unions]);
```

### Spline Array

![Spline array example](/examples/dsl/spline-array.iso.png)

```ts
const baseThickness = 6;
const bossHeight = 8;
const bossSize = 12;

const base = extrude(
  "base",
  profileRect(160, 90, [0, 0, 0]),
  baseThickness,
  "body:base"
);

const bosses = featureArrayAlongSpline(
  {
    points: [
      [-60, -20, baseThickness],
      [-30, 25, baseThickness],
      [20, -10, baseThickness],
      [60, 30, baseThickness],
    ],
    count: 7,
    mode: "spline",
  },
  ({ index, offset }) =>
    extrude(
      `boss-${index}`,
      profileRect(bossSize, bossSize, offset),
      bossHeight,
      `body:boss-${index}`
    )
);

const unions = [];
let current = "body:base";
for (let i = 0; i < bosses.length; i++) {
  const result = i === bosses.length - 1 ? "body:main" : `body:union-${i}`;
  unions.push(
    booleanOp(
      `union-${i}`,
      "union",
      selectorNamed(current),
      selectorNamed(`body:boss-${i}`),
      result
    )
  );
  current = result;
}

const examplePart = part("example-spline-array", [base, ...bosses, ...unions]);
```

## Selectors, Predicates, Ranking

- `selectorFace(predicates, rank?) -> FaceQuery`
- `selectorEdge(predicates, rank?) -> EdgeQuery`
- `selectorSolid(predicates, rank?) -> SolidQuery`
- `selectorNamed(name) -> NamedOutput`
- `predNormal(value) -> Predicate`
- `predPlanar() -> Predicate`
- `predCreatedBy(featureId) -> Predicate`
- `predRole(value) -> Predicate`
- `rankMaxArea() -> RankRule`
- `rankMinZ() -> RankRule`
- `rankMaxZ() -> RankRule`
- `rankClosestTo(target) -> RankRule`

## Example

```ts
import { buildPart } from "trueform";
import { part } from "trueform/dsl/core";
import { extrude, profileRect, profileRef, sketch2d } from "trueform/dsl/geometry";

const plate = part("plate", [
  sketch2d("sketch-base", [
    { name: "profile:base", profile: profileRect(100, 60) },
  ]),
  extrude(
    "base-extrude",
    profileRef("profile:base"),
    6,
    "body:main",
    ["sketch-base"]
  ),
]);

// const backend = ...
// const result = buildPart(plate, backend);
```

## Generated API Reference

You can generate a full API reference from TSDoc comments:

```bash
npm run docs:api
```

This emits static HTML to `docs/public/api`. When running VitePress, open `/api/`.
