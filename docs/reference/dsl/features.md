# Features DSL

## Import

```ts
import {
  extrude,
  plane,
  revolve,
  sweep,
  pipe,
  shell,
  mirror,
  deleteFace,
  replaceFace,
  moveBody,
  splitBody,
  splitFace,
  thicken,
  hole,
  fillet,
  chamfer,
  thread,
  draft,
  patternLinear,
  patternCircular,
  booleanOp,
} from "trueform/dsl/features";
```

## Features

- `extrude(id, profile, depth, result?, deps?, opts?) -> Extrude`
- `plane(id, width, height, result?, opts?) -> Plane`
- `surface(id, profile, result?, deps?) -> Surface`
- `revolve(id, profile, axis, angle, result?, opts?) -> Revolve`
- `loft(id, profiles, result?, deps?, opts?) -> Loft`
- `sweep(id, profile, path, result?, deps?, opts?) -> Sweep`
- `pipe(id, axis, length, outerDiameter, innerDiameter?, result?, opts?) -> Pipe`
- `shell(id, source, thickness, result?, deps?, opts?) -> Shell`
- `mirror(id, source, plane, result?, deps?) -> Mirror`
- `deleteFace(id, source, faces, result?, deps?, opts?) -> DeleteFace` (staging)
- `replaceFace(id, source, faces, tool, result?, deps?, opts?) -> ReplaceFace` (staging)
- `moveBody(id, source, result?, deps?, opts?) -> MoveBody` (staging)
- `splitBody(id, source, tool, result?, deps?, opts?) -> SplitBody`
- `splitFace(id, faces, tool, result?, deps?) -> SplitFace`
- `draft(id, source, faces, neutralPlane, pullDirection, angle, result?, deps?) -> Draft` (staging)
- `thicken(id, surface, thickness, result?, deps?, opts?) -> Thicken`
- `thread(id, axis, length, majorDiameter, pitch, result?, deps?, opts?) -> Thread` (modelled)
- `hole(id, onFace, axis, diameter, depth, opts?) -> Hole`
- `fillet(id, edges, radius, deps?) -> Fillet`
- `chamfer(id, edges, distance, deps?) -> Chamfer`
- `booleanOp(id, op, left, right, result?, deps?) -> BooleanOp`
- `patternLinear(id, origin, spacing, count, depsOrOpts?) -> PatternLinear`
- `patternCircular(id, origin, axis, count, depsOrOpts?) -> PatternCircular`

Compatibility helpers (still exported):
- `pipeSweep(id, path, outerDiameter, innerDiameter?, result?, opts?) -> PipeSweep`
- `hexTubeSweep(id, path, outerAcrossFlats, innerAcrossFlats?, result?, opts?) -> HexTubeSweep`
- `union(id, left, right, result?, deps?) -> BooleanOp`
- `cut(id, left, right, result?, deps?) -> BooleanOp` (subtract)
- `intersect(id, left, right, result?, deps?) -> BooleanOp`

Examples:
- [Extrude](./examples/features#extrude)
- [Surface](./examples/features#surface)
- [Revolve](./examples/features#revolve)
- [Loft](./examples/features#loft)
- [Sweep](./examples/features#sweep)
- [Sweep (Arbitrary Sketch)](./examples/features#sweep-arbitrary-sketch)
- [Pipe](./examples/features#pipe)
- [Pipe Sweep](./examples/features#pipe-sweep)
- [Thread (Modeled)](./examples/features#thread-modeled)
- [Shell](./examples/features#shell)
- [Mirror](./examples/features#mirror)
- [Move Body](./examples/features#move-body)
- [Delete Face](./examples/features#delete-face)
- [Replace Face](./examples/features#replace-face)
- [Draft](./examples/features#draft)
- [Thicken](./examples/features#thicken)
- [Hole](./examples/features#hole)
- [Fillet](./examples/features#fillet)
- [Chamfer](./examples/features#chamfer)
- [Boolean](./examples/features#boolean-union)
- [Boolean Subtract](./examples/features#boolean-subtract)
- [Boolean Intersect](./examples/features#boolean-intersect)
- [Pattern](./examples/features#pattern-featurebody)
- [Pattern Circular](./examples/features#pattern-circular)

## Consolidation Notes

- Prefer `sweep` + explicit `profileCircle(...)` / `profilePoly(...)` for path sweeps.
- Prefer `booleanOp(..., "union" | "subtract" | "intersect", ...)` as the canonical boolean surface.
- `pipeSweep`, `hexTubeSweep`, `union`, `cut`, and `intersect` remain as compatibility aliases.

## Thread

Defaults use an ISO-style profile (60 deg flank angle with crest/root flats derived
from pitch and minor diameter). Override `profileAngle`, `crestFlat`, or
`rootFlat` to customize the profile.

Options (`opts`):
- `origin?: Point3D`
- `minorDiameter?: Scalar`
- `handedness?: "right" | "left"`
- `segmentsPerTurn?: Scalar`
- `profileAngle?: Scalar` (radians)
- `crestFlat?: Scalar`
- `rootFlat?: Scalar`

Modelled thread is currently staging behavior. Public docs intentionally avoid
showing it in the main feature examples until robustness tuning is complete.
