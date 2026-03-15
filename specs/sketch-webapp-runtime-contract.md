# Sketch Webapp Runtime Contract

Status: reference contract (TrueForm surface frozen, TrueCAD wiring pending)
Updated: 2026-03-14
Owner: sketch/runtime

Purpose: define the interaction contract between TrueCAD and the shared
TrueForm sketch solver during high-frequency editing.

Use:
- this file for the stable runtime contract
- `specs/sketch-solver-truecad-backlog.md` for remaining shared-solver work
- `specs/sketch-dimensioning-truecad-plan.md` for TrueCAD-owned integration work

## Goal

Define how TrueCAD (interaction loop) and TrueForm (canonical constraint solve)
cooperate during high-frequency dragging.

## Authority Split

1. TrueCAD (interaction/runtime)
- Owns pointer event handling, coalescing, and render cadence.
- Owns preview-state orchestration and transient constraint lifecycle.
- Decides when to request canonical solves (per-frame throttle + pointer-up).

2. TrueForm (geometry/solver)
- Owns deterministic constraint semantics and diagnostics.
- Owns canonical solution output and conflict/overconstraint classification.
- Must remain pure and worker-safe.

Rule: Preview is advisory; canonical state comes from TrueForm solve outputs.

## Frozen TrueForm Solver Surface (2026-03-05)

The following API surface is now treated as stable for TrueCAD integration:

1. Solve entry points
- `solveSketchConstraintsDetailed(...)`
- `solveSketchConstraintsDetailedAsync(...)`
- `solveSketchConstraintsAsync(...)`
- `createSketchConstraintSolveSession(...)`

2. Stable options contract
- `transientConstraints`
- `warmStartEntities` (internal/session usage; not for persisted authored data)
- `changedEntityIds`
- `changedConstraintIds`
- `maxIterations`
- `maxTimeMs`
- `signal`

3. Stable solve metadata contract
- `solveMeta.termination`: `converged | not-run | max-iterations | time-budget | aborted`
- `solveMeta.iterations`
- `solveMeta.elapsedMs`
- `solveMeta.maxResidual`
- `solveMeta.solvedComponentIds`
- `solveMeta.skippedComponentIds`

4. Stable diagnostic and drag-guidance contract
- `componentStatus[].freeMotionDirections`
- `constraintStatus[].diagnosticType`
- `constraintStatus[].relatedConstraintIds`

5. Async/session behavior guarantees
- Async solve yields to the next macrotask before executing the canonical solve.
- Async solve honors abort both before and after the yield boundary.
- Session warm-start state is not promoted from aborted solves.
- Session warm-start promotion is version-guarded so stale async results cannot
  overwrite newer session state.

## Solve Modes

1. Preview solve (during drag)
- API: `solveSketchConstraintsDetailed(..., options)` or session `solve(...)`.
- Use transient constraints for inference/snaps.
- Use `changedEntityIds` / `changedConstraintIds` to target affected components.
- Use bounded budgets (`maxTimeMs`, `maxIterations`) and abort superseded work.
- Prefer `freeMotionDirections` to keep preview motion inside the admissible DOF
  subspace when the sketch is not fully constrained.

2. Commit solve (pointer-up)
- Run with relaxed/no strict budget.
- Confirm final canonical geometry and diagnostics.
- Persist only authored constraints and resulting geometry.

## Cadence Defaults (Proposed)

1. Pointer event ingestion
- Coalesce pointermove events.
- Keep latest event only when solver is busy.

2. Preview solve cadence
- Trigger at most once per animation frame.
- Default preview budget:
  - `maxTimeMs: 4`
  - `maxIterations: 48`

3. Commit solve cadence
- Trigger on pointer-up with:
  - `maxTimeMs: undefined`
  - `maxIterations: undefined`

## SME Decisions (2026-03-05)

1. Preview policy
- Prioritize responsiveness over preview fidelity under load.
- Degrade solve quality first; avoid UI lag/stutter.

2. Frame target guidance
- Target 60 Hz interaction when possible (16.7 ms frame budget).
- Practical solver budget target for preview: 3-6 ms per frame.
- Keep headroom for input processing, scene updates, and rendering.

3. Pointer-up conflict policy
- Preferred default: commit last solvable state.
- Show diagnostics for unsatisfied/conflicting constraints.
- Rationale: persisted model state should remain canonical and solvable.

## Session API Usage Pattern

1. On drag start
- Create one solve session per edited sketch.

2. On each coalesced drag tick
- Send updated entities + transient constraints.
- Include changed ids where possible.
- Abort prior in-flight async solve before scheduling next.

3. On drag end
- Run final authoritative solve.
- Destroy or reset session.

## Jitter Controls

1. Always consume latest solved result, not stale intermediate results.
2. Ignore responses older than the most recent drag sequence id.
3. Keep preview budgets tight; avoid blocking render loop.
4. Use warm starts (`createSketchConstraintSolveSession`) to reduce frame-to-frame jumps.
5. Prefer component-targeted solves for local edits.

## Required Product Decisions (SME Input Needed)

1. Drag behavior in underconstrained DOF:
- Proposed default: allow motion in available DOF, constrain only where equations apply.

## Assembly Follow-On

Apply the same contract to assembly drag:
- local DOF-guided preview in TrueCAD
- canonical mate solve in TrueForm
- time-budgeted previews + authoritative commit on release
