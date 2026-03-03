# Sketch Dimensioning TrueForm Plan

Status: active implementation track

## Goal

Provide deterministic, headless sketch constraint solving for authoring and runtime
consumers without changing the OCCT backend contract.

## Product Boundary

- Own the sketch constraint schema and reference model.
- Own the authoritative 2D solve semantics and diagnostics.
- Emit explicit solved `feature.sketch2d.entities` before backend execution.
- Do not own dimension annotation layout, drag gestures, or viewport overlays.

## Phases

1. Authoring-only constraint surface
- Extend `feature.sketch2d` with authoring-time `constraints`.
- Add DSL builders for point refs and core constraints.
- Strip constraints after normalization so the backend still receives explicit geometry.

2. Minimal deterministic solver
- Support `fixPoint`, `coincident`, `horizontal`, `vertical`, and `distance`.
- Expand to `parallel`, `perpendicular`, and `equalLength` for line-line relations.
- Reuse authored coordinates as the deterministic seed.
- Iterate constraints in declaration order until stable or unsatisfied.
- Expose a solve report with remaining DOF so UI clients can classify sketch state.

3. Validation and diagnostics
- Validate constraint structure and reference shapes before solve.
- Throw explicit compile errors for missing refs, kind mismatches, and unsatisfied constraints.

4. Expansion path
- Add `parallel`, `perpendicular`, `equalLength`, `radius`, and `angle`.
- Upgrade from projection-based solving to a shared numerical solver package.
- Add DOF classification (`fully`, `under`, `over`) for UI consumers.

## API Direction

- Keep the solver pure TypeScript so the same implementation can run in:
  - `@trueform/core` normalization
  - browser workers in TrueCAD
  - test harnesses and headless tooling
