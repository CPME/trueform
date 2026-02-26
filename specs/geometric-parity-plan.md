# Geometric Parity Implementation Plan

Updated: 2026-02-26

Purpose: maintain a single checkpointed plan for progressing TrueForm toward
near feature parity on geometric part modeling workflows used in Onshape/SolidWorks.

## Success Targets

1. Weighted coverage score >= `0.85`.
2. Probe reliability >= `0.99`.
3. Staged geometric features reduced to edge-case-only behavior.

Metrics source:
- `specs/geometric-benchmark-corpus.json`
- `tools/ci/geometric-parity-report.mjs`

## Current Baseline

Snapshot command:

```bash
node tools/ci/geometric-parity-report.mjs --no-run
```

Snapshot (2026-02-24):
- Coverage: `0.759` (`ready=18`, `staging=8`, `missing=3`, `total=29`).
- Reliability: not measured in this snapshot (`--no-run`).
- Composite: `0.759`.

Coverage gap math to `0.85`:
- Current weighted points: `22.0` (`18 + 0.5*8`).
- Target weighted points: `24.65` (`0.85 * 29`).
- Needed delta: `+2.65` weighted points.

Interpretation:
- Promoting one `staging` corpus entry to `ready` gives `+0.5`.
- Implementing one `missing` entry to `staging` gives `+0.5`.
- Implementing one `missing` entry to `ready` gives `+1.0`.
- A practical near-parity path is six staged promotions (`+3.0`) plus hole-wizard implementation for stability/risk reduction.

## Milestones

| Milestone | Status | Notes |
| --- | --- | --- |
| M0: Baseline instrumentation | `completed` | Matrix, corpus, report script, npm commands landed. |
| M1: Split feature bootstrap | `completed` | DSL/IR/validation placeholders + red parity probe landed. |
| M2: Split backend implementation (`feature.split.body`) | `completed` | Initial OCCT execution landed with staging status + passing probe. |
| M3: Split face implementation (`feature.split.face`) | `completed` | Initial OCCT execution landed with staging status + passing probe. |
| M4: Split stabilization + promotion | `completed` | Robust e2e + failure-mode coverage landed; split body/face promoted to ready. |
| M5: Direct-edit feature wave (`move/delete/replace`) | `completed` | Core direct-edit features landed in staging with parity probes. |
| M6: Variable edge controls | `completed` | `feature.fillet.variable` and `feature.chamfer.variable` landed in staging. |
| M7: Advanced hole parity (`hole-wizard-standards`) | `completed` | Hole-wizard end-condition execution, parity probe, and failure-mode coverage landed; corpus moved to staging. |
| M8: Stage graduation wave 1 (direct-edit + variable edge + draft) | `completed` | Direct-edit, variable-edge, and draft promotions landed with conformance/failure/determinism coverage. |
| M9: Stage graduation wave 2 (thread + surface-mode reliability) | `in_progress` | Thread plus `feature.surface`/surface-mode revolve are promoted; remaining surface-mode entries still staged. |
| M10: Advanced profile ops (`rib/web`) | `in_progress` | OCCT rib/web thin open-profile execution + probe/failure coverage landed in staging; promotion hardening remains. |
| M11: Advanced surfacing slice (`boundary/fill/trim/extend/knit`) | `planned` | Land minimum production-credible subset and probe coverage (see `specs/advanced-surfacing-three-slices-plan.md`). |
| M12: Near-parity closure + gate validation | `in_progress` | Coverage/reliability gates are now met; remaining work is missing-feature closure (`rib/web`, advanced surfacing). |

## Execution Order (Near-Parity Path)

1. M7: implement hole-wizard standards/end conditions.
2. M8: promote `draft`, `move.body`, `move.face`, `delete.face`, `replace.face`, `variable edge`.
3. M9: promote `thread` and surface-mode entries after reliability hardening.
4. M10-M11: implement missing advanced profile + surfacing entries.
5. M12: lock thresholds with CI gate and freeze parity corpus update.

Rationale:
- This sequence improves coverage fast while reducing staging debt.
- It also avoids adding new high-complexity surfaces before stabilizing what already exists.

## Current Sprint Checklist (M7 + M8)

- [x] M7-1: Add hole-wizard standards/end-condition IR schema and DSL helpers.
- [x] M7-2: Implement OCCT backend execution for standards/end conditions.
- [x] M7-3: Add hole-wizard parity probe (`src/tests/occt.hole_wizard.e2e.probe.ts`).
- [x] M7-4: Add failure-mode tests (invalid standard/profile/end-condition combinations).
- [x] M7-5: Move corpus `hole-wizard-standards` from `missing` to `staging` or `ready`.

- [x] M8-1: Define promotion checklist template (conformance, failure mode, determinism).
- [x] M8-2: Promote `feature.move.body` when reliability probes clear gate.
- [x] M8-3: Promote `feature.move.face` when reliability probes clear gate.
- [x] M8-4: Promote `feature.delete.face` + `feature.replace.face` when healing probes clear gate.
- [x] M8-5: Promote `feature.fillet.variable` + `feature.chamfer.variable` when corner cases clear gate.
- [x] M8-6: Promote `feature.draft` when selector-extreme negative paths are covered.
- [x] M8-7: Update `src/feature_staging.ts`, `specs/feature-staging.md`, and corpus parity labels after each promotion.

## Promotion Gate (Per Feature)

Promote `staging` -> `ready` only when all are true:

1. Deterministic output across repeated runs (same inputs, same selector metadata contract).
2. Positive + negative e2e coverage for feature-specific failure modes.
3. No regression in existing corpus probe results.
4. Feature no longer requires exceptional consumer handling.
5. Staging notes removed or reduced to non-blocking edge-case caveats.

### Promotion Checklist Template

Use this checklist in parity-promotion PRs:

- [ ] `Conformance`: targeted parity probe passes for core workflow.
- [ ] `Failure mode`: negative-path test(s) cover known invalid/unsupported combinations.
- [ ] `Determinism`: repeated-run test confirms stable outputs/selector metadata.
- [ ] `Regression`: existing related probe suite remains green.
- [ ] `Registry/docs`: `src/feature_staging.ts`, `specs/feature-staging.md`, and corpus/matrix status stay aligned.

## Missing Feature Backlog (Post M8)

1. `advanced-surfacing-boundary-fill-knit` (M11).

## CI and Reporting Rules

For each parity-changing PR:

1. Update corpus entry parity in `specs/geometric-benchmark-corpus.json`.
2. Keep matrix status aligned in `specs/geometric-parity-matrix.md`.
3. Run report:

```bash
npm run parity:geometric:report
```

4. For threshold-gated branches:

```bash
npm run parity:geometric:check
```

## Progress Log

| Date | Update |
| --- | --- |
| 2026-02-21 | Added parity matrix, corpus manifest, and CI report tooling. |
| 2026-02-21 | Added split bootstrap stub (IR/DSL/validation/graph/normalize) and red parity probe. |
| 2026-02-21 | Implemented split body/face and promoted them to ready after stability probes. |
| 2026-02-22 | Implemented staged direct-edit features (`move.body`, `move.face`, `delete.face`, `replace.face`). |
| 2026-02-22 | Implemented staged variable edge controls (`fillet.variable`, `chamfer.variable`). |
| 2026-02-24 | Rebased parity tracker to explicit M7-M12 near-parity execution plan with quantified gap math. |
| 2026-02-24 | Completed M7-1: hole-wizard IR/schema/validation surface + DSL helper (`holeWizard`) and focused tests. |
| 2026-02-24 | Completed M7-2 through M7-5: OCCT hole-wizard end-condition execution, parity probe, failure-mode tests, and corpus status promotion to staging. |
| 2026-02-24 | Completed M8-1/M8-2: added explicit promotion checklist template and promoted `feature.move.body` to ready with deterministic parity probe coverage. |
| 2026-02-24 | Completed M8-3: promoted `feature.move.face` to ready after adding repeated-run determinism probe coverage. |
| 2026-02-24 | Completed M8-4: promoted `feature.delete.face` and `feature.replace.face` to ready with deterministic and failure-mode test coverage. |
| 2026-02-24 | Completed M8-5: promoted `feature.fillet.variable` and `feature.chamfer.variable` to ready with deterministic and failure-mode test coverage. |
| 2026-02-24 | Completed M8-6/M8-7: promoted `feature.draft` to ready after selector-extreme + determinism coverage and synchronized staging/corpus docs. |
| 2026-02-24 | M9 progress: promoted modeled thread to ready with deterministic and failure-mode e2e coverage. |
| 2026-02-24 | M9 progress: promoted `feature.surface` and surface-mode revolve to ready with determinism and negative-path coverage. |
| 2026-02-24 | Coverage gate exceeded in latest `--no-run` snapshot: `0.914` (`ready=26`, `staging=1`, `missing=2`); reliability gate still pending probe-run measurement. |
| 2026-02-24 | Full probe run now passes reliability gate: `1.000` (27/27). Remaining near-parity gap is missing-feature implementation (`rib/web`, advanced surfacing). |
| 2026-02-26 | M10 progress: added staging rib/web feature execution (`feature.rib`, `feature.web`) with OCCT probe + failure-mode tests and corpus/matrix/staging updates. |
