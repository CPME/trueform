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

## Semantic Topology Contract

Selectors are the primary stable-reference mechanism for authored workflows.

Guidance:
- Prefer datums, predicates, ranking, and named outputs when authoring new
  features.
- Use selectors to re-resolve semantic intent on rebuild rather than relying on
  transient kernel topology.
- If a workflow cannot preserve semantic continuity, it should fail explicitly
  rather than silently degrading to raw topology traversal.

## Stable Named Selections

`selectorNamed(...)` can target emitted stable selection ids directly. This is
the intended contract for external tools and services that want to reuse a
selection from a prior build.

Examples:

```ts
selectorNamed("face:body.main~base.top");
selectorNamed("face:body.main~union-1.right.side.1");
selectorNamed("edge:body.main~union-1.right.side.1.bound.top");
selectorNamed("face:body.main~subtract-1.top");
selectorNamed("face:body.main~subtract-1.cut.bottom");
selectorNamed("face:body.main~intersect-1.side.1");
selectorNamed("edge:body.main~intersect-1.side.1.bound.top");
selectorNamed("edge:body.main~edge-fillet.fillet.seed.1.bound.top");
selectorNamed("edge:body.main~edge-chamfer.chamfer.seed.1.join.chamfer.seed.2");
selectorNamed("edge:body.main~subtract-1.cut.side.1.bound.top");
selectorNamed("edge:body.main~subtract-1.cut.bottom.join.cut.side.1");
selectorNamed("edge:body.main~edge-fillet.fillet.seed.1.seam");
```

Guidance:
- Prefer authored selectors and named outputs for in-document feature authoring.
- Use emitted stable ids primarily for cross-build reuse, runtime interaction,
  inspection, and external tool round-tripping.
- Use the full emitted id exactly as returned by the runtime.
- Prefer semantic ids like `cut.*`, `*.bound.*`, `*.join.*`, and `*.seam` when present.
- Raw numeric ids (for example `face:12` or `edge:4`) are not part of the stable
  semantic-topology contract.
- If runtime emits a weaker deterministic id (for example `*.end.1`,
  `*.edge.1`, or a hashed suffix),
  it is still valid and stable; treat it as an opaque token rather than trying
  to infer geometry from the name.
