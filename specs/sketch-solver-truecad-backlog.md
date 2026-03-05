# Sketch Solver TrueCAD Backlog

Status: active tracker
Updated: 2026-03-05

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
- `angle`
- `radius`
- `tangent`
- `concentric`
- `pointOnLine`
- `collinear`
- `midpoint`
- `symmetry`
- Commits: `0e01a64`, `9b9a791`, plus 2026-03-04 follow-up additions

3. Shared solver API
- `solveSketchConstraints(...)`
- `solveSketchConstraintsDetailed(...)`
- Exported from `@trueform/core`
- Commit: `9b9a791` (`Extend sketch constraint solver coverage`)

4. Current UI-usable solve report
- overall status:
  - `fully-constrained`
  - `underconstrained`
  - `overconstrained`
  - `conflict`
  - `ambiguous`
- total and remaining DOF
- total/remaining DOF now use Jacobian-rank analysis
- connected-component solve status
  - `component-constrained` is used here when a component is internally rigid
    but still globally movable
  - per-component remaining DOF
  - per-component remaining rigid-body DOF
  - per-component `grounded`
- per-entity status
  - `status` is the primary UI-safe bucket
  - `status === "fully-constrained"` now means the entity has no remaining
    local shape DOF and belongs to a grounded component
  - floating but internally rigid entities remain `underconstrained`
  - includes `componentId`, `componentStatus`, `grounded`, and component
    remaining rigid-body DOF as diagnostics
- per-constraint diagnostics (`constraintStatus[]`)
- Important: per-entity remaining DOF is still a local column-rank estimate, not a
  full nullspace attribution.

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
Status: completed on 2026-03-04

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
Status: completed on 2026-03-04

Needed outcome:
- Support line-line angular constraints.
- Use it as the semantic basis for angular driving dimensions in TrueCAD.

Why:
- TrueCAD can fake some line editing now, but not mainstream angular dimensioning.

Minimum deliverable:
- Add DSL helper, IR/schema/validation coverage, solver behavior, and targeted
  tests.

5. `radius` constraint
Status: completed on 2026-03-04

Needed outcome:
- Support driving radius constraints on circles and arcs.

Why:
- Radial dimensions are a core sketch UI expectation.
- TrueCAD cannot do real radial driving dimensions without this.

Minimum deliverable:
- Start with circles, then extend to arcs.

### P2: Correctness Upgrade

6. Replace heuristic DOF accounting with rank-based analysis
Status: completed on 2026-03-04

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
Status: completed on 2026-03-05

9. `concentric`
Status: completed on 2026-03-05

10. `point-on-line`
Status: completed on 2026-03-05

11. `collinear`
Status: completed on 2026-03-05

12. `midpoint`
Status: completed on 2026-03-05

13. `symmetry`
Status: completed on 2026-03-05

Why this group:
- These are core to general-purpose sketching, but they are not required for the
  first TrueCAD black/blue + basic dimension workflow.

### P4: Performance and Interaction Support

14. Connected-component solve partitioning
Status: completed on 2026-03-05

Needed outcome:
- Solve only affected subgraphs/components.
- Report component-local statuses.

Why:
- Important for responsive editing as sketches grow.

15. Temporary/session-only constraints
Status: completed on 2026-03-05

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

1. Upgrade the numerical solve core.
2. Add the broader CAD constraint families.

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
- 2026-03-04: Made `solveSketchConstraintsDetailed(...)` non-mutating so it
  clones caller-owned entities before applying solve steps.
- 2026-03-04: Added `sketch.constraint.angle` with DSL, IR, validation,
  normalization, solver behavior, and targeted tests.
- 2026-03-04: Added `sketch.constraint.radius` for circles and arcs with DSL,
  IR, validation, normalization, solver behavior, and targeted tests.
- 2026-03-04: Replaced heuristic total/remaining DOF accounting with Jacobian
  rank analysis and rigid-mode-aware ambiguity classification in the detailed
  solve report.
- 2026-03-04: Replaced the projection-first solve loop with a damped
  least-squares solve over driven handles, followed by a short deterministic
  polish pass to preserve existing target-entity semantics.
- 2026-03-04: Added connected-component solve diagnostics so the detailed report
  now distinguishes floating but internally solved components
  (`component-constrained`) from globally grounded `fully-constrained`
  components, while keeping `entity.status` safe for direct CAD UI use:
  only grounded entities can report `fully-constrained`.
- 2026-03-05: Generalized numerical driven-variable selection with
  shape-aware target handle coverage (including scalar radius DOFs on circle
  targets for new constraint families) while preserving deterministic
  compatibility behavior for legacy line/point constraints.
- 2026-03-05: Added `sketch.constraint.tangent`,
  `sketch.constraint.concentric`, and `sketch.constraint.pointOnLine` with DSL,
  IR/validation/normalization coverage, solver behavior, and targeted tests.
- 2026-03-05: Partitioned numerical solve/polish execution by connected
  constraint components so independent subgraphs solve in isolation with
  deterministic component ordering.
- 2026-03-05: Added `sketch.constraint.collinear`,
  `sketch.constraint.midpoint`, and `sketch.constraint.symmetry` with DSL,
  IR/validation/normalization coverage, solver behavior, and targeted tests.
- 2026-03-05: Added transient/session-only constraint overlays to
  `solveSketchConstraintsDetailed(...)` via `options.transientConstraints`,
  with source-tagged diagnostics (`authored` vs `transient`) and duplicate id
  guardrails across merged constraint sets.

### Next Recommended Task

Profiling + targeted tuning of drag-time solve cadence in the webapp loop
(especially event coalescing and frame-budgeted solve scheduling) now that
transient/session constraints are available in core.

## Webapp Hardening Plan (Tracked Checklist)

Status: active checklist
Last updated: 2026-03-05

1. [ ] Incremental session solve API
- Add warm-start/session handles for drag loops.
- Support partial/changed-graph updates instead of whole-sketch solves.

2. [ ] Time-budgeted async solving
- Worker-safe async solve API with cancellation/abort.
- Return best-so-far solution + residual/diagnostics under frame budgets.

3. [ ] Numerical robustness upgrades
- Add better trust-region/LM safeguards for near-singular systems.
- Add variable scaling/normalization to improve stability across units/sizes.

4. [ ] Nullspace/DOF-aware drag behavior
- Expose admissible free-motion directions for underconstrained states.
- Keep drag motion in expected DOF subspace to reduce jumpy behavior.

5. [ ] UX-grade diagnostics
- Add higher-quality conflict attribution (minimal/conflict-set style outputs).
- Add redundancy explanations suitable for UI tooltips and badges.

6. [ ] Broader constraint coverage (as needed)
- Expand curve-family and advanced constraints based on TrueCAD needs.
- Keep all additions fully tested via targeted e2e suites.

7. [ ] Determinism and replay/perf harness
- Add drag-trace replay tests and property/fuzz tests.
- Add performance regression checks (latency/frame-budget thresholds).

8. [ ] TrueCAD integration contract
- Define/implement interaction loop contract (preview cadence vs authoritative solve points).
- Validate same pattern for sketch + assembly drag workflows.
