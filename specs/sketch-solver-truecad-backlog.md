# Sketch Solver TrueCAD Backlog

Status: active backlog
Updated: 2026-03-13
Owner: sketch/runtime

Purpose: track only the remaining shared-solver work needed to support the
intended TrueCAD sketch UX.

Related:
- `specs/sketch-webapp-runtime-contract.md` - frozen runtime contract
- `specs/sketch-dimensioning-truecad-plan.md` - TrueCAD-owned integration plan
- `specs/archive/sketch-solver-truecad-progress-2026-03-05.md` - completed
  implementation history

## Shipped Baseline

Already in place:

- Authoring-time `feature.sketch2d.constraints` with deterministic solve during
  normalization.
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
  - component-local status
  - per-entity status
  - per-constraint diagnostics
  - async/session termination metadata
- Worker-safe async solving, warm-start sessions, determinism coverage, and
  preview-latency guardrails.

Current known limit:
- Per-entity remaining DOF is still a local column-rank estimate, not full
  nullspace attribution.

## Outstanding Work

1. Nullspace/DOF-aware drag behavior
- Expose admissible free-motion directions for underconstrained states.
- Keep drag motion inside the expected DOF subspace to reduce jumpy behavior.
- Acceptance:
  - stable drag guidance output exists in the shared solver API
  - drag-trace coverage shows predictable motion on underconstrained sketches

2. UX-grade diagnostics
- Add higher-quality conflict attribution suitable for editor feedback.
- Add redundancy explanations suitable for tooltips, badges, and inline errors.
- Acceptance:
  - diagnostics identify likely conflicting or redundant constraints
  - output is stable enough for direct UI presentation

3. Broader constraint coverage (only if TrueCAD needs it)
- Expand curve-family and advanced constraints based on real integration needs.
- Keep additions fully covered by targeted e2e suites.
- Acceptance:
  - each added constraint has DSL/IR/validation/solver/test coverage
  - no regression in determinism or preview-latency guardrails

4. TrueCAD integration contract and wiring
- Validate the preview cadence vs authoritative solve loop in the real editor.
- Reuse the same pattern later for assembly drag when needed.
- Acceptance:
  - the interaction loop matches `specs/sketch-webapp-runtime-contract.md`
  - TrueCAD runtime wiring is validated against the shared solver behavior

## Execution Order

1. Nullspace/DOF-aware drag behavior.
2. UX-grade diagnostics.
3. Real TrueCAD wiring against the frozen runtime contract.
4. Additional constraint families only if integration exposes a concrete gap.

## Non-Goals For This Slice

- Full spline solving
- Pattern constraints
- Constraint glyph layout
- Dimension annotation placement
- Any OCCT/backend coupling

## Validation

- `npm run build -- --pretty false`
- targeted sketch solver e2e and property/fuzz suites
- drag-trace replay coverage for interaction-sensitive changes
