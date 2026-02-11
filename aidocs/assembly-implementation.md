# Assembly Implementation Plan

This plan keeps assemblies kernel-agnostic and builds the constraint solver on
connector frames, with optional verification layers that can use a backend
later.

## Phase 1: Constraint Surface (IR + DSL)

1. Lock constraint semantics in `src/ir.ts` and `src/dsl/assembly.ts` for a minimal
   set that maps cleanly to 6-DOF bodies:
   - `mate.fixed`, `mate.coaxial`, `mate.planar` (already present)
   - Add `mate.distance`, `mate.angle`, `mate.parallel`, `mate.perpendicular`
   - Add `mate.insert` (coaxial + face-to-face) as a composite
   - Add joint-style mates: `mate.slider`, `mate.hinge` (optional)
2. Define explicit constraint equations for each mate in solver docs/comments.
3. Expand validation in `src/ir_validate.ts` to reject invalid references early.

## Phase 2: Connector Frames + Resolution

1. Treat connectors as the sole assembly input: a connector resolves to a frame
   `{ origin, xAxis, zAxis }` in part space.
2. Ensure connector resolution is deterministic and rebuild-safe:
   - Use selectors + datums only; no face/edge IDs.
   - Re-resolve on each rebuild.
3. Extend `src/connectors.ts` to expose a stable `ConnectorFrame` contract with
   confidence flags for missing axes.

## Phase 3: Solver Hardening

1. Improve `src/assembly_solver.ts`:
   - DOF accounting per mate and per instance.
   - Constraint weighting and soft constraints for over-constrained cases.
   - Singularity detection and stall handling with structured errors.
   - Move from finite-difference Jacobians to analytic Jacobians for common mates.
2. Add solver diagnostics:
   - per-constraint residuals
   - per-instance step size
   - converge/fail reason codes

## Phase 4: Assembly Build Pipeline

1. Define an assembly build function that accepts:
   - `assemblyIR`
   - `partBuildResults` (connectors only; no B-Reps)
   - returns `AssemblySolveResult` with instance transforms
2. Keep this separate from kernel execution. No OCCT types allowed in assembly
   solver path.

## Phase 5: UX / API Features

1. Named assembly outputs (selection sets for downstream systems).
2. Assembly drivers (let one mate be the driving dimension).
3. Constraint groups (suppress / isolate a set for configuration workflows).

## Phase 6: Optional Kernel-Aware Checks

1. Interference/clearance checks:
   - mesh-based coarse checks first.
   - backend boolean/intersection only off the main thread.
2. Export-time collision checks (CI tier).

## Tests to Add

1. `src/tests/assembly.constraints.e2e.test.ts`
2. `src/tests/assembly.overconstrained.e2e.test.ts`
3. `src/tests/assembly.singular.e2e.test.ts`

## Recommendation on Kernel Dependency

Keep the solver completely independent of OCCT. Use OCCT only for optional
verification (collision/clearance), not for solving.
