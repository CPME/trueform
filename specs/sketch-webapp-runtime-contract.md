# Sketch Webapp Runtime Contract

Status: draft for implementation
Updated: 2026-03-05

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

## Solve Modes

1. Preview solve (during drag)
- API: `solveSketchConstraintsDetailed(..., options)` or session `solve(...)`.
- Use transient constraints for inference/snaps.
- Use `changedEntityIds` / `changedConstraintIds` to target affected components.
- Use bounded budgets (`maxTimeMs`, `maxIterations`) and abort superseded work.

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
