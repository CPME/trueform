# Sketch Solver TrueCAD Backlog

Status: shared solver backlog closed
Updated: 2026-03-14
Owner: sketch/runtime

Purpose: preserve the status of the shared TrueForm sketch solver after the
remaining shared-solver gaps were closed. Downstream editor wiring still lives
in the consumer runtime.

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
  - likely conflict attribution
  - likely redundancy attribution
  - async/session termination metadata
- Worker-safe async solving, warm-start sessions, determinism coverage, and
  preview-latency guardrails.
- Nullspace-attributed DOF reporting and component-level free-motion directions
  for underconstrained and ambiguous states.

## Remaining Downstream Work

The remaining work is outside the shared TrueForm solver:

1. TrueCAD runtime wiring
- Consume `componentStatus[].freeMotionDirections` during drag preview.
- Use per-constraint attribution directly for glyphs, badges, and inline errors.
- Validate the interaction loop against `specs/sketch-webapp-runtime-contract.md`.

2. Additional constraint/entity coverage only on demand
- Expand the surface only when consumer integration exposes a concrete need.
- Keep each addition covered by DSL/IR/validation/solver/e2e tests.

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
