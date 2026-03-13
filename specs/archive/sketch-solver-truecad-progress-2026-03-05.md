# Sketch Solver TrueCAD Progress Log (Archived 2026-03-05)

Purpose: preserve the implementation history that was previously embedded in
the live TrueCAD sketch solver backlog.

Use:
- `specs/sketch-solver-truecad-backlog.md` for the active backlog.
- `specs/sketch-webapp-runtime-contract.md` for the current runtime contract.
- `specs/sketch-dimensioning-truecad-plan.md` for the TrueCAD-owned integration
  plan.

## Completed Milestones

Completed by 2026-03-05:

1. Structured solver outcomes for `fully-constrained`, `underconstrained`,
   `overconstrained`, `conflict`, and `ambiguous`.
2. Per-constraint diagnostics with residuals and implicated entities.
3. Non-mutating solve APIs suitable for UI state management.
4. Dimension-driving `angle` and `radius` constraints.
5. Rank-based DOF analysis in the detailed solve report.
6. Numerical solve core replacing projection-only behavior.
7. Mainstream constraint-family additions:
   - `tangent`
   - `concentric`
   - `pointOnLine`
   - `collinear`
   - `midpoint`
   - `symmetry`
8. Connected-component solve partitioning.
9. Temporary/session-only constraints for drag and inferencing.
10. Async/session solve APIs, warm starts, determinism coverage, and
    preview-latency guardrails.

## Key Commits

- `0e01a64` Add authoring-time sketch constraint solving
- `9b9a791` Extend sketch constraint solver coverage
- `e9aaa37` Add structured solve outcomes and per-constraint diagnostics
- 2026-03-04 follow-up additions for `angle`, `radius`, and rank-based DOF
- 2026-03-05 follow-up additions for numerical solve hardening, new constraint
  families, sessions, async semantics, and fuzz/perf coverage

## Baseline Frozen By This Point

By 2026-03-05 the following were already in place:

- Shared solver entry points:
  - `solveSketchConstraints(...)`
  - `solveSketchConstraintsDetailed(...)`
  - `solveSketchConstraintsDetailedAsync(...)`
  - `solveSketchConstraintsAsync(...)`
  - `createSketchConstraintSolveSession(...)`
- Supported constraints:
  - `fixPoint`
  - `coincident`
  - `horizontal`
  - `vertical`
  - `distance`
  - `parallel`
  - `perpendicular`
  - `equalLength`
  - `angle`
  - `radius`
  - `tangent`
  - `concentric`
  - `pointOnLine`
  - `collinear`
  - `midpoint`
  - `symmetry`
- UI-usable diagnostics:
  - overall solve status
  - per-component status
  - per-entity status
  - per-constraint diagnostics
  - solve termination metadata for async/session usage
