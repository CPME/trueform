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
