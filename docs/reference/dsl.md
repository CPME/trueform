# DSL Reference

This page documents the current `dsl` helpers exported from `trueform`. The API is intentionally compact and data-first. For types, see `src/dsl.ts`.

## Import

```ts
import { dsl } from "trueform";
```

## Document and Parts

- `dsl.context(overrides?) -> BuildContext`
- `dsl.document(id, parts, context?, assemblies?, opts?) -> IntentDocument`
- `dsl.part(id, features, opts?) -> IntentPart`

## Parameters and Expressions

- `dsl.paramLength(id, value) -> ParamDef`
- `dsl.paramAngle(id, value) -> ParamDef`
- `dsl.paramCount(id, value) -> ParamDef`
- `dsl.exprLiteral(value, unit?) -> Expr`
- `dsl.exprParam(id) -> Expr`
- `dsl.exprAdd(left, right) -> Expr`
- `dsl.exprSub(left, right) -> Expr`
- `dsl.exprMul(left, right) -> Expr`
- `dsl.exprDiv(left, right) -> Expr`
- `dsl.exprNeg(value) -> Expr`

## Assemblies (Data-Only in v1)

- `dsl.assembly(id, instances, opts?) -> IntentAssembly`
- `dsl.assemblyInstance(id, part, transform?, tags?) -> AssemblyInstance`
- `dsl.transform(opts?) -> Transform`
- `dsl.assemblyRef(instance, selector) -> AssemblyRef`
- `dsl.mateFixed(a, b) -> AssemblyMate`
- `dsl.mateCoaxial(a, b) -> AssemblyMate`
- `dsl.matePlanar(a, b, offset?) -> AssemblyMate`
- `dsl.assemblyOutput(name, refs) -> AssemblyOutput`

## Datums and Sketches

- `dsl.datumPlane(id, normal, origin?, deps?) -> DatumPlane`
- `dsl.datumAxis(id, direction, origin?, deps?) -> DatumAxis`
- `dsl.datumFrame(id, on, deps?) -> DatumFrame`
- `dsl.sketch2d(id, profiles, opts?) -> Sketch2D` (opts supports `entities`)

## Sketch Primitives

- `dsl.sketchLine(id, start, end, opts?) -> SketchLine`
- `dsl.sketchArc(id, start, end, center, direction, opts?) -> SketchArc`
- `dsl.sketchCircle(id, center, radius, opts?) -> SketchCircle`
- `dsl.sketchEllipse(id, center, radiusX, radiusY, opts?) -> SketchEllipse`
- `dsl.sketchRectCenter(id, center, width, height, opts?) -> SketchRectangle`
- `dsl.sketchRectCorner(id, corner, width, height, opts?) -> SketchRectangle`
- `dsl.sketchSlot(id, center, length, width, opts?) -> SketchSlot`
- `dsl.sketchPolygon(id, center, radius, sides, opts?) -> SketchPolygon`
- `dsl.sketchSpline(id, points, opts?) -> SketchSpline`
- `dsl.sketchPoint(id, point, opts?) -> SketchPoint`

### Sketch Examples

The sketch examples below are rendered via `npm run docs:examples` and use
transparent backgrounds with light strokes for dark docs themes.

#### Line

```ts
dsl.sketchLine("line-1", [-40, -20], [40, 20]);
```

![Line sketch](/examples/sketch/line.svg)

#### Arc

```ts
dsl.sketchArc("arc-1", [30, 0], [0, 30], [0, 0], "ccw");
```

![Arc sketch](/examples/sketch/arc.svg)

#### Circle

```ts
dsl.sketchCircle("circle-1", [0, 0], 22);
```

![Circle sketch](/examples/sketch/circle.svg)

#### Ellipse

```ts
dsl.sketchEllipse("ellipse-1", [0, 0], 26, 12, { rotation: dsl.exprLiteral(20, "deg") });
```

![Ellipse sketch](/examples/sketch/ellipse.svg)

#### Rectangle (Center)

```ts
dsl.sketchRectCenter("rect-center", [0, 0], 60, 32, { rotation: dsl.exprLiteral(10, "deg") });
```

![Center rectangle sketch](/examples/sketch/rect-center.svg)

#### Rectangle (Corner)

```ts
dsl.sketchRectCorner("rect-corner", [-25, -12], 60, 30, { rotation: dsl.exprLiteral(-8, "deg") });
```

![Corner rectangle sketch](/examples/sketch/rect-corner.svg)

#### Slot

```ts
dsl.sketchSlot("slot-1", [0, 0], 70, 16, { rotation: dsl.exprLiteral(12, "deg") });
```

![Slot sketch](/examples/sketch/slot.svg)

#### Polygon

```ts
dsl.sketchPolygon("poly-1", [0, 0], 24, 6);
```

![Polygon sketch](/examples/sketch/polygon.svg)

#### Spline

```ts
dsl.sketchSpline("spline-1", [
  [-30, -10],
  [-10, 20],
  [10, 10],
  [30, -15],
]);
```

![Spline sketch](/examples/sketch/spline.svg)

#### Point

```ts
dsl.sketchPoint("point-1", [0, 0]);
```

![Point sketch](/examples/sketch/point.svg)

## Profiles

- `dsl.profileRect(width, height, center?) -> Profile`
- `dsl.profileCircle(radius, center?) -> Profile`
- `dsl.profileRef(name) -> ProfileRef`

## Features

- `dsl.extrude(id, profile, depth, result?, deps?) -> Extrude`
- `dsl.revolve(id, profile, axis, angle, result?, opts?) -> Revolve`
- `dsl.hole(id, onFace, axis, diameter, depth, opts?) -> Hole`
- `dsl.fillet(id, edges, radius, deps?) -> Fillet`
- `dsl.chamfer(id, edges, distance, deps?) -> Chamfer`
- `dsl.booleanOp(id, op, left, right, result?, deps?) -> BooleanOp`

## Feature Examples

The examples below are rendered from OpenCascade.js output via
`npm run docs:examples`.

### Extrude

```ts
const part = dsl.part("example-extrude", [
  dsl.extrude("base", dsl.profileRect(80, 50), 12, "body:main"),
]);
```

![Extrude example](/examples/dsl/extrude.iso.png)

### Revolve

```ts
const part = dsl.part("example-revolve", [
  dsl.revolve(
    "ring-revolve",
    dsl.profileRect(3, 6, [1.5, 3, 0]),
    "+X",
    "full",
    "body:main"
  ),
]);
```

![Revolve example](/examples/dsl/revolve.iso.png)

### Hole

```ts
const part = dsl.part("example-hole", [
  dsl.extrude("base", dsl.profileRect(90, 50), 12, "body:main"),
  dsl.hole(
    "hole-1",
    dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()]),
    "-Z",
    14,
    "throughAll",
    { deps: ["base"] }
  ),
]);
```

![Hole example](/examples/dsl/hole.iso.png)

### Fillet

```ts
const part = dsl.part("example-fillet", [
  dsl.extrude("cyl", dsl.profileCircle(14), 28, "body:main"),
  dsl.fillet(
    "edge-fillet",
    dsl.selectorEdge([dsl.predCreatedBy("cyl")], [dsl.rankMaxZ()]),
    3,
    ["cyl"]
  ),
]);
```

![Fillet example](/examples/dsl/fillet.iso.png)

### Boolean Union

```ts
const part = dsl.part("example-boolean", [
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
]);
```

![Boolean example](/examples/dsl/boolean.iso.png)

## Patterns

- `dsl.patternLinear(id, origin, spacing, count, deps?) -> PatternLinear`
- `dsl.patternCircular(id, origin, axis, count, deps?) -> PatternCircular`

## Selectors, Predicates, Ranking

- `dsl.selectorFace(predicates, rank?) -> FaceQuery`
- `dsl.selectorEdge(predicates, rank?) -> EdgeQuery`
- `dsl.selectorSolid(predicates, rank?) -> SolidQuery`
- `dsl.selectorNamed(name) -> NamedOutput`
- `dsl.predNormal(value) -> Predicate`
- `dsl.predPlanar() -> Predicate`
- `dsl.predCreatedBy(featureId) -> Predicate`
- `dsl.predRole(value) -> Predicate`
- `dsl.rankMaxArea() -> RankRule`
- `dsl.rankMinZ() -> RankRule`
- `dsl.rankMaxZ() -> RankRule`
- `dsl.rankClosestTo(target) -> RankRule`

## Example

```ts
import { dsl, buildPart } from "trueform";

const part = dsl.part("plate", [
  dsl.sketch2d("sketch-base", [
    { name: "profile:base", profile: dsl.profileRect(100, 60) },
  ]),
  dsl.extrude(
    "base-extrude",
    dsl.profileRef("profile:base"),
    6,
    "body:main",
    ["sketch-base"]
  ),
]);

// const backend = ...
// const result = buildPart(part, backend);
```

## Generated API Reference

You can generate a full API reference from TSDoc comments:

```bash
npm run docs:api
```

This emits static HTML to `docs/public/api`. When running VitePress, open `/api/`.
