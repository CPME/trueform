# DSL Reference

This page documents the current DSL helpers exported from `trueform`. The API is intentionally compact and data-first. For types, see `src/dsl.ts`.

## Import

```ts
import { context, document, part, exprLiteral } from "trueform/dsl/core";
import { sketch2d, extrude, profileRect, profileRef } from "trueform/dsl/geometry";
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

## Tolerancing

- `refSurface(selector) -> RefSurface`
- `refFrame(selector) -> RefFrame`
- `surfaceProfileConstraint(id, target, tolerance, opts?) -> SurfaceProfileConstraint`

### Tolerancing Example (PMI Sidecar)

The example below attaches two surface profile constraints to a simple plate.
The top surface is tighter and uses itself as the reference frame; the bottom
surface is looser. `requirement` and `capabilities` are included to show how
PMI metadata can travel with the constraints.

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

const part = dsl.part(
  "example-tolerancing",
  [dsl.extrude("base", dsl.profileRect(120, 70), 12, "body:main")],
  {
    constraints: [
      dsl.surfaceProfileConstraint(
        "profile-top",
        dsl.refSurface(topFace),
        0.05,
        {
          referenceFrame: dsl.refFrame(topFace),
          requirement: "req-flatness-top",
          capabilities: ["mill-3axis"],
        }
      ),
      dsl.surfaceProfileConstraint(
        "profile-bottom",
        dsl.refSurface(bottomFace),
        0.1,
        { requirement: "req-flatness-bottom" }
      ),
    ],
  }
);

// After building with a backend:
// const { step, pmi } = exportStepAp242WithPmi(backend, body, part, { schema: "AP242" });
```

![Tolerancing example](/examples/dsl/tolerancing.iso.png)

Example PMI JSON (sidecar emitted alongside AP242 STEP):

```json
{
  "schema": "trueform.pmi.v1",
  "partId": "example-tolerancing",
  "constraints": [
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
      "tolerance": 0.05,
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
      "requirement": "req-flatness-top",
      "capabilities": ["mill-3axis"]
    },
    {
      "id": "profile-bottom",
      "kind": "constraint.surfaceProfile",
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
      },
      "tolerance": 0.1,
      "requirement": "req-flatness-bottom"
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

```ts
sketchLine("line-1", [-40, -20], [40, 20]);
```

![Line sketch](/examples/sketch/line.svg)

#### Arc

```ts
sketchArc("arc-1", [30, 0], [0, 30], [0, 0], "ccw");
```

![Arc sketch](/examples/sketch/arc.svg)

#### Circle

```ts
sketchCircle("circle-1", [0, 0], 22);
```

![Circle sketch](/examples/sketch/circle.svg)

#### Ellipse

```ts
sketchEllipse("ellipse-1", [0, 0], 26, 12, { rotation: exprLiteral(20, "deg") });
```

![Ellipse sketch](/examples/sketch/ellipse.svg)

#### Rectangle (Center)

```ts
sketchRectCenter("rect-center", [0, 0], 60, 32, { rotation: exprLiteral(10, "deg") });
```

![Center rectangle sketch](/examples/sketch/rect-center.svg)

#### Rectangle (Corner)

```ts
sketchRectCorner("rect-corner", [-25, -12], 60, 30, { rotation: exprLiteral(-8, "deg") });
```

![Corner rectangle sketch](/examples/sketch/rect-corner.svg)

#### Slot

```ts
sketchSlot("slot-1", [0, 0], 70, 16, { rotation: exprLiteral(12, "deg") });
```

![Slot sketch](/examples/sketch/slot.svg)

#### Polygon

```ts
sketchPolygon("poly-1", [0, 0], 24, 6);
```

![Polygon sketch](/examples/sketch/polygon.svg)

#### Spline

```ts
sketchSpline("spline-1", [
  [-30, -10],
  [-10, 20],
  [10, 10],
  [30, -15],
]);
```

![Spline sketch](/examples/sketch/spline.svg)

#### Point

```ts
sketchPoint("point-1", [0, 0]);
```

![Point sketch](/examples/sketch/point.svg)

## Profiles

- `profileRect(width, height, center?) -> Profile`
- `profileCircle(radius, center?) -> Profile`
- `profilePoly(sides, radius, center?, rotation?) -> Profile`
- `profileSketchLoop(loop, opts?) -> Profile`
- `profileRef(name) -> ProfileRef`

## Features

- `extrude(id, profile, depth, result?, deps?) -> Extrude`
- `revolve(id, profile, axis, angle, result?, opts?) -> Revolve`
- `loft(id, profiles, result?, deps?) -> Loft`
- `hole(id, onFace, axis, diameter, depth, opts?) -> Hole`
- `fillet(id, edges, radius, deps?) -> Fillet`
- `chamfer(id, edges, distance, deps?) -> Chamfer`
- `booleanOp(id, op, left, right, result?, deps?) -> BooleanOp`

## Feature Examples

The examples below are rendered from OpenCascade.js output via
`npm run docs:examples`.

### Extrude

```ts
const examplePart = part("example-extrude", [
  extrude("base", profileRect(80, 50), 12, "body:main"),
]);
```

![Extrude example](/examples/dsl/extrude.iso.png)

### Revolve

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

![Revolve example](/examples/dsl/revolve.iso.png)

### Loft

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

![Loft example](/examples/dsl/loft.iso.png)

Notes:
- If either profile is an open sketch (e.g., `profileSketchLoop(..., { open: true })`), the loft outputs a surface (kind `face`) instead of a solid.

### Hole

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

![Hole example](/examples/dsl/hole.iso.png)

Counterbores and countersinks are optional via `counterbore` / `countersink`
in the options object (they are mutually exclusive). `countersink.angle` uses
radians; use `exprLiteral(82, "deg")` if you prefer degrees.

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

![Hole counterbore/countersink example](/examples/dsl/hole-advanced.iso.png)

### Fillet

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

![Fillet example](/examples/dsl/fillet.iso.png)

### Chamfer

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

![Chamfer example](/examples/dsl/chamfer.iso.png)

### Boolean Union

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

![Boolean example](/examples/dsl/boolean.iso.png)

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

![Feature array example](/examples/dsl/feature-array.iso.png)

### Sketch Array

```ts
const exampleSketch = sketch2d("sketch-rect-array", [], {
  entities: sketchArray(
    { count: [3, 2], spacing: [28, 18], origin: [-28, -9] },
    ({ index, offset }) => sketchRectCenter(`rect-${index}`, offset, 18, 10)
  ),
});
```

![Sketch array example](/examples/sketch/rect-array.svg)

### Circular Array

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

![Circular array example](/examples/dsl/circular-array.iso.png)

### Radial Array

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

![Radial array example](/examples/dsl/radial-array.iso.png)

### Spline Array

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

![Spline array example](/examples/dsl/spline-array.iso.png)

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
