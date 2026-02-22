# Geometric Parity Implementation Plan

Updated: 2026-02-22

Purpose: maintain a single checkpointed plan for progressing TrueForm toward
near feature parity on geometric part modeling workflows.

## Success Targets

1. Weighted coverage score >= `0.85`.
2. Probe reliability >= `0.99`.
3. Staged geometric features reduced to edge-case-only behavior.

Metrics source:
- `specs/geometric-benchmark-corpus.json`
- `tools/ci/geometric-parity-report.mjs`

## Milestones

| Milestone | Status | Notes |
| --- | --- | --- |
| M0: Baseline instrumentation | `completed` | Matrix, corpus, report script, npm commands landed. |
| M1: Split feature bootstrap | `completed` | DSL/IR/validation placeholders + red parity probe landed. |
| M2: Split backend implementation (`feature.split.body`) | `completed` | Initial OCCT execution landed with staging status + passing probe. |
| M3: Split face implementation (`feature.split.face`) | `completed` | Initial OCCT execution landed with staging status + passing probe. |
| M4: Split stabilization + promotion | `completed` | Robust e2e + failure-mode coverage landed; split body/face promoted to ready. |
| M5: Next high-ROI direct-edit feature (delete/replace/move face/body) | `completed` | `feature.move.body`, `feature.move.face`, `feature.delete.face`, and `feature.replace.face` landed in staging with OCCT probes. |
| M6: Variable edge controls (`feature.fillet.variable`, `feature.chamfer.variable`) | `completed` | Added staged variable fillet/chamfer DSL+IR+OCCT support with parity probes and docs examples. |

## Current Sprint Checklist (Variable Edge M6)

- [x] Add IR schema + staging registry coverage for `feature.fillet.variable`.
- [x] Add IR schema + staging registry coverage for `feature.chamfer.variable`.
- [x] Implement OCCT backend execution paths for per-entry variable fillet/chamfer.
- [x] Add OCCT parity probes for variable fillet/chamfer workflows.
- [x] Add DSL/docs examples for variable fillet/chamfer helpers.
- [x] Move `variable-fillet-chamfer` corpus entry from missing to staging.
- [ ] Implement hole-wizard standards/end-condition parity (remaining advanced hole workflow gap).

## Progress Log

| Date | Update |
| --- | --- |
| 2026-02-21 | Added parity matrix, corpus manifest, and CI report tooling. |
| 2026-02-21 | Added split bootstrap stub (IR/DSL/validation/graph/normalize) and red parity probe. |
| 2026-02-21 | Implemented `feature.split.body` in OCCT backend, moved split-body parity to staging, and kept split-face pending. |
| 2026-02-21 | Implemented `feature.split.face` in OCCT backend and moved split-face parity to staging. |
| 2026-02-21 | Added split stability e2e parameter-sweep tests (interior/non-intersecting tools + orientation coverage). |
| 2026-02-21 | Added selector/failure-mode split tests and promoted split body/face from staging to ready. |
| 2026-02-22 | Implemented `feature.move.body` (translation/rotation/scale), added OCCT probe coverage, and advanced move/copy/scale parity from missing to staging. |
| 2026-02-22 | Implemented staged `feature.delete.face` (defeaturing + sewing fallback), added OCCT probe coverage, and advanced delete/replace-face parity from missing to staging. |
| 2026-02-22 | Implemented staged `feature.replace.face` (reshape + sewing fallback), added OCCT probe coverage, and completed delete/replace-face staging support. |
| 2026-02-22 | Implemented staged `feature.move.face` (reshape + sewing fallback), added OCCT probe coverage, and completed core direct-edit face/body staging coverage. |
| 2026-02-22 | Implemented staged variable edge controls (`feature.fillet.variable`, `feature.chamfer.variable`) with OCCT parity probes and DSL/docs examples. |
