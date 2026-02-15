# Feature Sandbox Task List

Updated: 2026-02-15

Scope audited against requested feature set:

- [x] Sketch
- [x] Extrude
- [x] Revolve
- [x] Sweep
- [x] Loft
- [x] Fillet
- [x] Chamfer
- [x] Boolean
- [x] Pattern (linear/circular layout and source-solid replication)
- [x] Mirror
- [x] Shell
- [x] Draft (staging)
- [x] Reference geometry (datum plane/axis/frame + selector-based references)

## Active Sandbox Work

- [x] Add `feature.draft` to IR + DSL + compile graph + normalization + validation
- [x] Add backend execution path for `feature.draft` in OCCT and mock backends
- [x] Add focused tests:
  - `src/tests/occt.draft.e2e.test.ts`
  - `src/tests/dsl.helpers.e2e.test.ts` (draft helper)
  - `src/tests/graph.inference.e2e.test.ts` (draft dependency inference)
  - `src/tests/feature_staging.e2e.test.ts` (draft staging signal)
- [x] Stage `feature.draft` in `src/feature_staging.ts` while robustness hardening continues

## Next Tasks

- [ ] Extend pattern source support beyond solids (e.g., surface/face replication semantics).
- [ ] Add negative-path draft tests (invalid selector kinds, extreme angles, mismatched source owners).
- [ ] Add negative-path feature-pattern tests (result without source, invalid source kind, zero/negative counts).
