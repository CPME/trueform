# DSL Quickstart

This page shows the shortest path from idea to built part in TrueForm.

## How TrueForm Works

1. Author declarative intent (features, datums, selectors) in the DSL.
2. Compile into deterministic IR.
3. Build IR with a backend (OpenCascade.js in v1).
4. Consume named outputs (`body:*`, `surface:*`) for meshing/export/analysis.

## Minimal Build

```ts
import { buildPart } from "trueform";
import { part } from "trueform/dsl/core";
import { extrude, profileRect } from "trueform/dsl/features";

const plate = part("quickstart-plate", [
  extrude("base", profileRect(80, 50), 8, "body:main"),
]);

// const result = buildPart(plate, backend);
```

## Basic Categories

### Sketch + Profile

```ts
const sketch = sketch2d("sketch-1", [
  { name: "profile:base", profile: profileRect(60, 30) },
]);
```

### Solid Feature

```ts
extrude("base", profileRef("profile:base"), 12, "body:base");
```

### Selector-Driven Feature

```ts
hole(
  "through-hole",
  selectorFace([predPlanar(), predNormal("+Z")], [rankMaxZ()]),
  "-Z",
  8,
  "throughAll"
);
```

### Boolean

```ts
booleanOp(
  "cut-1",
  "subtract",
  selectorNamed("body:base"),
  selectorNamed("body:tool"),
  "body:main"
);
```

### Pattern Intent

```ts
patternLinear("p1", topFace, [20, 0], [3, 1], { source: selectorNamed("body:seed") });
```

### Tolerancing Intent

```ts
surfaceProfileConstraint("profile-top", refSurface(topFace), 0.05);
```

## What to Use by Default

- Use `booleanOp` directly with `op: "union" | "subtract" | "intersect"`.
- Use `sweep` with explicit profiles (`profileCircle`, `profilePoly`, sketch loops).
- Use patterns for runtime replication intent; use generators for authoring-time expansion.

## Next

- [Features](./features)
- [Patterns](./patterns)
- [Generators](./generators)
- [Examples](./examples/)
