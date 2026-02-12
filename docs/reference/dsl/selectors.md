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
