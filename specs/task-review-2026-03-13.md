# Task Review (2026-03-13)

Purpose: consolidate the repo's current task state after reviewing task trackers
under `specs/`. There is no `ai-tasks/` directory in this checkout.

## Archived As Complete

- `specs/archive/pre-feature-sprint-board.md`
  - All `PRE-001` through `PRE-104` entries are marked completed.
- `specs/archive/runtime-improvement-tracker.md`
  - Immediate runtime work is recorded as executed; remaining items are defer/drop decisions rather than active tasks.
- `specs/archive/refactor-plan-2026-02-22.md`
  - The scoped refactor items are complete and validated; follow-on work now lives in the maintainability backlog.
- `specs/archive/sketch-dimensioning-trueform-plan.md`
  - The initial TrueForm sketch-dimensioning implementation plan is effectively complete; active follow-on work now lives in the TrueCAD backlog and runtime contract docs.

## Outstanding Work

### Geometric parity and feature maturity

- `specs/geometric-parity-plan.md`
  - Finish M9 surface-mode reliability hardening.
  - Promote staged `rib/web` work in M10.
  - Finish M11 advanced surfacing beyond Slice 1.
  - Close M12 after missing-feature work is complete and docs/registry stay aligned.
- `specs/advanced-surfacing-three-slices-plan.md`
  - Slice 2 remains open: boundary/fill surface with continuity.
  - Slice 3 remains open: guide curves and curve-on-surface infrastructure.
  - Per-slice PR checklist remains unchecked.
- `specs/feature-sandbox-task-list.md`
  - Extend pattern sources beyond solids.
  - Add negative-path draft tests.
  - Add negative-path feature-pattern tests.

### Solver and TrueCAD integration

- `specs/sketch-solver-truecad-backlog.md`
  - Nullspace/DOF-aware drag behavior.
  - UX-grade conflict and redundancy diagnostics.
  - Broader constraint coverage as needed.
  - TrueCAD integration contract and runtime wiring.
- `specs/sketch-dimensioning-truecad-plan.md`
  - Shared constraint contract adoption in TrueCAD.
  - Interactive solve loop wiring.
  - Visual workbench and authoring ergonomics.
- `specs/sketch-webapp-runtime-contract.md`
  - TrueForm surface is frozen, but TrueCAD wiring is still pending.

### Runtime, packaging, and architecture

- `specs/maintainability-refactor-backlog-2026-03-10.md`
  - Remaining backend decomposition:
    - `src/occt/shape_primitives.ts`
    - `src/occt/profile_resolution.ts`
    - `src/occt/mesh_export.ts`
  - Runtime service route/handler extraction.
  - IR contract source unification.
  - Real package ownership migration.
  - Additional architecture guardrails.
- `specs/vision-gap-bridge-plan-2026-03-01.md`
  - Stage 1: doc and contract alignment.
  - Stage 2: finish the v1 boundary.
  - Stage 3: package architecture migration.
  - Stage 4: consolidate runtime/platform story and feature promotion policy.
- `specs/v1-contract.md`
  - Still marked `Draft (Step 1 in progress)`.
- `specs/packaging-split-timeline.md`
  - Still marked `Draft`; package migration work is not finished.

### Semantic topology and unwrap follow-up

- `specs/topology-selection-stabilization-plan-2026-03-01.md`
  - Semantic naming for boolean-created topology.
  - Stronger rebinding/repair.
  - Semantic corner/intersection anchors if product needs justify them.
- `specs/unwrap-progress-2026-02-24.md`
  - Seam stitching after connected-face placement.
  - Seam continuity assertions.
  - Private review render workflow.
  - Re-enable public unwrap examples only after quality sign-off.

## Notes

- Several archived trackers had stale `active` wording even though their scoped work was complete.
- The most actionable live task sources are now:
  - `specs/geometric-parity-plan.md`
  - `specs/advanced-surfacing-three-slices-plan.md`
  - `specs/maintainability-refactor-backlog-2026-03-10.md`
  - `specs/sketch-solver-truecad-backlog.md`
