# DSL Reference

This section documents the current DSL helpers exported from `trueform`. The API is intentionally compact and data-first. For types, see `src/dsl.ts`.

## Import

```ts
import { context, document, part, exprLiteral } from "trueform/dsl/core";
import { sketch2d, extrude, surface, profileRect, profileRef } from "trueform/dsl/geometry";
import { assembly, instance, mateFixed } from "trueform/dsl/assembly";
import { refFrame, refSurface, cosmeticThread, surfaceProfileConstraint } from "trueform/dsl/tolerancing";
import { featureArray, sketchArray } from "trueform/dsl/generators";
```

If you prefer a single namespace, the `dsl` export is still available from `trueform`.

## Reference Pages

- [Core](./core)
- [Assembly](./assembly)
- [Tolerancing](./tolerancing)
- [Geometry and Sketching](./geometry)
- [Features](./features)
- [Patterns](./patterns)
- [Generators](./generators)
- [Selectors, Predicates, Ranking](./selectors)
- [Examples](./examples/)

## Generated API Reference

You can generate a full API reference from TSDoc comments:

```bash
npm run docs:api
```

This emits static HTML to `docs/public/api`. When running VitePress, open `/api/`.
