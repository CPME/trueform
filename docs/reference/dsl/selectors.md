# Selectors, Predicates, Ranking

## Import

```ts
import {
  selectorFace,
  selectorEdge,
  selectorNamed,
  predPlanar,
  predCreatedBy,
  rankMaxArea,
} from "trueform/dsl/selectors";
```

## Selectors

- `selectorFace(predicates, rank?) -> FaceQuery`
- `selectorEdge(predicates, rank?) -> EdgeQuery`
- `selectorSolid(predicates, rank?) -> SolidQuery`
- `selectorNamed(name) -> NamedOutput`

## Predicates

- `predNormal(value) -> Predicate`
- `predPlanar() -> Predicate`
- `predCreatedBy(featureId) -> Predicate`
- `predRole(value) -> Predicate`

## Ranking

- `rankMaxArea() -> RankRule`
- `rankMinZ() -> RankRule`
- `rankMaxZ() -> RankRule`
- `rankClosestTo(target) -> RankRule`

Examples:
- [Fillet](./examples/features#fillet)
- [Hole](./examples/features#hole)
- [Assembly connectors](./examples/assembly#basic-assembly)

## Stable Named Selections

`selectorNamed(...)` can target emitted stable selection ids directly. This is
the intended contract for external tools and services that want to reuse a
selection from a prior build.

Examples:

```ts
selectorNamed("face:body.main~base.top");
selectorNamed("edge:body.main~edge-fillet.fillet.seed.1.bound.top");
selectorNamed("edge:body.main~edge-chamfer.chamfer.seed.1.join.chamfer.seed.2");
```

Guidance:
- Use the full emitted id exactly as returned by the runtime.
- Prefer semantic ids like `*.bound.*` and `*.join.*` when present.
- If runtime emits a fallback id (for example `*.edge.1` or a hashed suffix),
  it is still valid and stable; treat it as an opaque token rather than trying
  to infer geometry from the name.
