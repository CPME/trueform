# Sketch Solver TrueCAD Backlog

Status: active tracker
Updated: 2026-03-03

## Purpose

Track the remaining TrueForm sketch-solver work needed to support the intended
TrueCAD sketch UX, in implementation order, with explicit progress.

This is the working backlog and progress log for the shared sketch solver, not
the broad architectural proposal.

## Current State

Implemented and committed:

1. Authoring-time sketch constraints on `feature.sketch2d`
- Constraints are accepted during authoring/normalization and stripped before
  backend execution.
- Commit: `0e01a64` (`Add authoring-time sketch constraint solving`)

2. Current supported constraints
- `fixPoint`
- `coincident`
- `horizontal`
- `vertical`
- `distance`
- `parallel`
- `perpendicular`
- `equalLength`
- Commits: `0e01a64`, `9b9a791`

3. Shared solver API
- `solveSketchConstraints(...)`
- `solveSketchConstraintsDetailed(...)`
- Exported from `@trueform/core`
- Commit: `9b9a791` (`Extend sketch constraint solver coverage`)

4. Current UI-usable solve report
- overall status: `fully-constrained` or `underconstrained`
- total and remaining DOF
- per-entity status
- Important: current DOF accounting is heuristic, not rank-based.

## Priority Order

### P0: Immediate TrueCAD Unlockers

1. Structured red-state outcomes
Status: completed on 2026-03-03

Needed outcome:
- Return structured solver states for:
  - `fully-constrained`
  - `underconstrained`
  - `overconstrained`
  - `conflict`
  - `ambiguous`

Why first:
- TrueCAD can already render black/blue with the current report.
- It still lacks a clean backend-aligned source for red-state UX.

Minimum deliverable:
- Extend the solve report without breaking normalization-time failure behavior.
- Distinguish unsatisfied vs contradictory vs ambiguous outcomes.

2. Per-constraint diagnostics
Status: completed on 2026-03-03

Needed outcome:
- Report constraint-level residuals and failure metadata.
- Identify which constraint(s) caused failure.
- Identify implicated entity ids.

Why first:
- TrueCAD needs this for inline diagnostics, badges, and useful error surfacing.

Minimum deliverable:
- Add `constraintStatus[]` to the detailed report.
- Include residual, pass/fail, and message/code.

3. Non-mutating solve API
Status: pending

Needed outcome:
- Preserve the current APIs or add a new API that does not mutate caller-owned
  entity arrays.

Why first:
- Frontend editor state is easier to reason about with immutable inputs/outputs.
- The current mutating behavior is usable but brittle for UI state management.

Minimum deliverable:
- Make `solveSketchConstraintsDetailed(...)` clone entities before applying solve
  steps, or add a pure wrapper that guarantees immutability.

### P1: Dimensioning Coverage

4. `angle` constraint
Status: pending

Needed outcome:
- Support line-line angular constraints.
- Use it as the semantic basis for angular driving dimensions in TrueCAD.

Why:
- TrueCAD can fake some line editing now, but not mainstream angular dimensioning.

Minimum deliverable:
- Add DSL helper, IR/schema/validation coverage, solver behavior, and targeted
  tests.

5. `radius` constraint
Status: pending

Needed outcome:
- Support driving radius constraints on circles and arcs.

Why:
- Radial dimensions are a core sketch UI expectation.
- TrueCAD cannot do real radial driving dimensions without this.

Minimum deliverable:
- Start with circles, then extend to arcs.

### P2: Correctness Upgrade

6. Replace heuristic DOF accounting with rank-based analysis
Status: pending

Needed outcome:
- Compute DOF from the actual constrained system, not simple consumption counts.
- Detect redundant constraints more accurately.

Why:
- The current black/blue classification is acceptable for simple line sketches,
  but it will misclassify more coupled systems.

Minimum deliverable:
- Introduce a Jacobian/rank-based analysis pass for the detailed report.

7. Replace projection-style solving with a general numerical solver
Status: pending

Needed outcome:
- Move from the current deterministic projection pass to a robust numerical
  approach (e.g. damped Gauss-Newton / LM).

Why:
- The current solver is intentionally narrow and order-sensitive.
- More coupled constraint graphs will need a true residual-based solve.

Minimum deliverable:
- Preserve deterministic seeding/order rules.
- Keep pure TypeScript and worker-safe execution.

### P3: Mainstream CAD Constraint Families

8. `tangent`
Status: pending

9. `concentric`
Status: pending

10. `point-on-line`
Status: pending

11. `collinear`
Status: pending

12. `midpoint`
Status: pending

13. `symmetry`
Status: pending

Why this group:
- These are core to general-purpose sketching, but they are not required for the
  first TrueCAD black/blue + basic dimension workflow.

### P4: Performance and Interaction Support

14. Connected-component solve partitioning
Status: pending

Needed outcome:
- Solve only affected subgraphs/components.
- Report component-local statuses.

Why:
- Important for responsive editing as sketches grow.

15. Temporary/session-only constraints
Status: pending

Needed outcome:
- Support drag-time and inference-time temporary constraints without polluting
  authored constraint state.

Why:
- Important for high-quality drag behavior in TrueCAD.

## Explicit Non-Goals For The Next Slice

- Full spline solving
- Pattern constraints
- Constraint glyph layout
- Dimension annotation placement
- Any OCCT/backend coupling

## Suggested Execution Sequence

1. Add structured red-state outcomes.
2. Add per-constraint diagnostics.
3. Make the detailed solver API non-mutating.
4. Add `angle`.
5. Add `radius`.
6. Upgrade DOF analysis.
7. Upgrade the numerical solve core.
8. Add the broader CAD constraint families.

## Progress Log

### Done

- 2026-03-03: Added authoring-time sketch constraints and normalization-time
  solve path. Commit: `0e01a64`.
- 2026-03-03: Added line-line constraints (`parallel`, `perpendicular`,
  `equalLength`) and exported a detailed solve report for UI consumers. Commit:
  `9b9a791`.
- 2026-03-03: Added structured solve outcomes (`overconstrained`, `conflict`,
  `ambiguous`) and per-constraint diagnostics in the detailed solve report while
  preserving strict normalization-time throws through the wrapper API. Commit:
  `e9aaa37`.

### Next Recommended Task

Make the detailed solver API non-mutating. That is the next highest-value step
for cleaner TrueCAD editor-state integration.
