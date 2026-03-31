# Curve Foundation Plan (2026-03-30)

Status: active design
Owner: geometry/core

Purpose: define the curve-first feature sequence that should land before more
advanced surfacing work. This replaces the previous assumption that advanced
profile work (`rib/web`) would be the next geometry slice.

Related:
- `specs/advanced-surfacing-three-slices-plan.md`
- `specs/geometric-parity-plan.md`
- `src/occt/thread_ops.ts`
- `src/occt/path_wire_builder.ts`

## Direction

Before more advanced surfacing work, prioritize:

1. `helix`
2. `spiral`
3. `sketch3d`

Rule: do not restart `rib/web` until the reusable 3D curve contract is in
place. Thin open-profile features should be rebuilt on top of the new curve and
3D-sketch foundation rather than reusing the removed slice design.

## Current State

Already present:

- inline `Path3D` values:
  - `path.polyline`
  - `path.spline`
  - `path.segments`
- 2D authoring via `feature.sketch2d`
- staged `feature.curve.intersect`
- backend path construction in `src/occt/path_wire_builder.ts`
- ad hoc helix generation inside `src/occt/thread_ops.ts`

Missing:

- canonical helix/spiral path primitives
- reusable 3D curve authoring contract
- `feature.sketch3d`
- a clear distinction between:
  - inline path literals used by a single feature
  - reusable named curve artifacts used across features

## Recommendation

Do not start with full `feature.sketch3d`.

Start by defining reusable curve geometry primitives first, because:

- `sweep`, `pipeSweep`, `hexTubeSweep`, and future guide-curve workflows
  already consume `Path3D`
- the thread feature already contains useful helix construction logic that
  should be extracted instead of duplicated
- `sketch3d` should sit on top of a stable 3D-curve contract rather than invent
  one implicitly

## Delivery Order

### Slice C1: Parametric 3D path primitives

Add deterministic path-level primitives:

- `path.helix`
- `path.spiral`

Proposed DSL:

- `pathHelix(opts)`
- `pathSpiral(opts)`

Initial scope:

- helix:
  - axis
  - origin
  - radius
  - pitch
  - turns or length
  - handedness
  - startAngle
- spiral:
  - plane or axis
  - origin
  - startRadius
  - endRadius or radialStep
  - turns
  - direction

Implementation rule:

- extract the current thread helix sampling logic into a shared curve helper
- keep sampling deterministic and parameter-driven
- normalize these paths before backend execution just like existing `Path3D`
  variants

Exit gate:

- `sweep` and pipe-style features can consume `path.helix` and `path.spiral`
- dedicated e2e tests exist for both path variants

### Slice C2: Reusable curve feature surface

Add named curve outputs rather than relying only on inline paths.

Candidate feature surface:

- `feature.curve.helix`
- `feature.curve.spiral`
- later `feature.curve.project`

Why this slice exists:

- advanced surfacing guide curves need reusable curve artifacts
- `curve.intersect` should not remain the only curve-producing feature

Initial result contract:

- `result: "curve:<id>"`
- backend-owned curve artifact only
- no B-Rep handles exposed to clients

Exit gate:

- named curves can be consumed by later guide-curve workflows
- repeated runs preserve deterministic output ids and selector metadata

### Slice C3: `feature.sketch3d`

Add an authoring container for open 3D curves and construction references.

Initial non-goals:

- no 3D constraint solver in v1
- no 3D profile/region solving
- no attempt to match mature desktop CAD sketch UX in the first slice

Initial value:

- organize line/spline/helix/spiral authoring in 3D
- emit named curve outputs for downstream sweep, pipe, and surfacing workflows
- provide a stable home for future projected/intersection curves

Recommended initial entity set:

- 3D line
- 3D spline
- helix primitive
- spiral primitive
- construction points/frames

Exit gate:

- `feature.sketch3d` can author reusable open curves for downstream features
- curve naming and downstream resolution are deterministic

## Effect On Advanced Surfacing

Updated dependency order:

1. C1: `path.helix` / `path.spiral`
2. C2: reusable curve feature outputs
3. C3: `feature.sketch3d`
4. then resume advanced surfacing guide-curve work

This changes the previous assumption in
`specs/advanced-surfacing-three-slices-plan.md` that Slice 3 should immediately
follow Slice 1. Guide-curve surfacing should now depend on the curve foundation
work above.

## Targeted Tests

- `src/tests/occt.path_helix.e2e.test.ts`
- `src/tests/occt.path_spiral.e2e.test.ts`
- `src/tests/occt.curve_helix.e2e.test.ts`
- `src/tests/occt.curve_spiral.e2e.test.ts`
- `src/tests/occt.sketch3d.e2e.test.ts`

Also add:

- normalization/validation coverage
- determinism probes for curve outputs
- negative-path tests for invalid pitch/radius/turn combinations

