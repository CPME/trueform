# Maintainability Refactor Backlog (2026-03-10)

Status: active  
Owner: core/runtime

Purpose: track the remaining maintainability-heavy refactor work after the first safe decomposition pass.

## Completed In This Session

1. Centralized `KernelResult -> ResolutionContext` construction.
- Added: `src/resolution_context.ts`
- Rewired call sites in executor/connectors/assertions/dimensions/native-local transport/tests.
- Commit: `f61cffb`

2. Extracted runtime HTTP response and mesh-streaming helpers.
- Added: `apps/tf-service/http_response.mjs`
- Simplified: `apps/tf-service/server.mjs` (delegating wrappers).
- Commit: `85b3eab`

3. Extracted OCCT vector/scalar math helpers.
- Added: `src/occt/vector_math.ts`
- Removed duplicated tail helpers from `src/backend_occt.ts`.
- Commit: `233655d`

4. Extracted tenant scoping utilities from runtime server.
- Added: `apps/tf-service/tenant.mjs`
- Simplified tenant and scoped-key logic in `apps/tf-service/server.mjs`.
- Commit: `64951b6`

5. Deduplicated split-slot parsing/semantic-base logic.
- Added: `src/selection_slots.ts`
- Reused in `src/selectors.ts` and `src/selection_semantics.ts`.
- Commit: `e6abd91`

6. Reduced duplicate 204/CORS response code paths.
- Reused `writeNoContent` helper in runtime server.
- Commit: `31c05d5`

7. Replaced fake OCCT helper boundaries with typed operation contexts.
- Added: `src/occt/operation_contexts.ts`
- Rewired extracted OCCT modules to consume explicit context contracts instead of `ctx: any` / backend-instance leakage.
- Split the selection ledger into focused submodules and added direct module tests for ledger/pattern/face-edit boundaries.
- Commits: `5a5235b`, `f94f736`, `992d9bf`

8. Extracted shell execution behind a typed feature boundary.
- Added: `src/occt/shell_ops.ts`
- Added direct coverage: `src/tests/occt.shell.module.test.ts`
- Regression coverage: build + `occt.shell.e2e` + `occt.modifier_lineage.e2e`
- Commit: `b33f4b8`

9. Extracted sweep feature execution for pipe/hex tube variants.
- Added: `src/occt/sweep_feature_ops.ts`
- Added direct coverage: `src/tests/occt.sweep_feature.module.test.ts`
- Regression coverage: build + `occt.pipe_sweep.e2e` + `occt.hex_tube_sweep.e2e` + `feature_staging.e2e`
- Commit: `0492f71`

10. Extracted boolean execution behind a typed feature boundary.
- Added: `src/occt/boolean_ops.ts`
- Added direct coverage: `src/tests/occt.boolean.module.test.ts`
- Regression coverage: build + `occt.boolean.e2e` + `occt.boolean.lineage.e2e` + `occt.boolean.split_lineage.e2e`
- Commit: `28f8555`

11. Extracted thin-profile execution for rib/web features.
- Added: `src/occt/thin_profile_ops.ts`
- Added direct coverage: `src/tests/occt.thin_profile.module.test.ts`
- Regression coverage: build + `occt.rib_web.e2e.probe` + `occt.rib_web.failure_modes.e2e`
- Commit: `b81da82`

12. Extracted generic sweep execution behind a typed feature boundary.
- Added: `src/occt/sweep_ops.ts`
- Added direct coverage: `src/tests/occt.sweep.module.test.ts`
- Added dedicated e2e coverage: `src/tests/occt.sweep.e2e.test.ts`
- Regression coverage: build + `occt.sweep.e2e` + `occt.surface.e2e`
- Commit: `7b479eb`

13. Extracted sketch/profile output assembly behind a typed feature boundary.
- Added: `src/occt/sketch_ops.ts`
- Added direct coverage: `src/tests/occt.sketch.module.test.ts`
- Regression coverage: build + `occt.sketch.e2e` + `occt.sketch_profile_extrude.e2e` + `occt.surface.e2e` + `occt.rib_web.e2e.probe` + `occt.loft.e2e`
- Commit: `439c54c`

14. Deleted duplicated path/profile glue in the backend.
- Added: `src/occt/shape_result.ts`
- Consolidated shared sweep result publishing and the duplicated `makePipeSolid` context adapter into single implementations.
- Regression coverage: build + sweep module suites + `occt.surface.e2e`
- Commit: `7e3504a`

15. Extracted mirror execution behind a typed feature boundary.
- Added: `src/occt/mirror_ops.ts`
- Added direct coverage: `src/tests/occt.mirror.module.test.ts`
- Regression coverage: build + `occt.mirror.e2e`
- Commit: pending in current worktree

16. Extracted draft execution behind a typed feature boundary and standardized feature-scoped backend errors.
- Added: `src/occt/draft_ops.ts`
- Added: `src/occt/feature_errors.ts`
- Extended: `src/errors.ts` `BackendError` now carries optional `details`
- Added direct coverage: `src/tests/occt.draft.module.test.ts`
- Regression coverage: build + `occt.draft.e2e` + `occt.modifier_lineage.e2e` + `occt.selector_stability.e2e`
- Commit: `d549850`

17. Extracted shared transform primitives for translate/scale/rotate/mirror.
- Added: `src/occt/transform_primitives.ts`
- Added direct coverage: `src/tests/occt.transform_primitives.module.test.ts`
- Reused by backend transform helpers and `src/occt/mirror_ops.ts`
- Regression coverage: build + `occt.transform_primitives.module` + `occt.move_body.e2e.probe` + `occt.move_face.e2e.probe` + `occt.mirror.e2e` + `occt.unwrap.e2e`
- Commit: pending in current worktree

## Remaining Maintainability Work (Prioritized)

## Active Detailed Plan: `src/backend_occt.ts` Decomposition

Target: break `src/backend_occt.ts` into focused OCCT helper modules while preserving behavior.

Execution slices:
1. [x] Extract vector/scalar math helpers (`src/occt/vector_math.ts`).
2. [x] Extract selector owner/context/single-selection utilities (`src/occt/selection_resolution.ts`).
3. [x] Extract unique subshape collection utility (`src/occt/shape_collection.ts`).
4. [x] Extract stable selection id + ledger record helper group.
5. [x] Extract selection collection orchestration (`collectSelections`) with dependency injection.
6. [x] Extract mesh/export helper cluster.
   - Progress: STEP/STL export orchestration moved to `src/occt/export_ops.ts`; mesh path moved to `src/occt/mesh_ops.ts`.
   - Commits: `2d515d1`, `161963e`
7. [ ] Extract profile/sketch/plane resolution helper cluster.
   - Progress: profile reference + primitive profile face/wire helpers moved to `src/occt/profile_resolution.ts`.
   - Progress: plane/sketch basis resolution moved to `src/occt/plane_basis.ts`.
   - Progress: pure sketch 2D geometry helpers moved to `src/occt/sketch_geometry.ts`.
   - Progress: sketch wire-loop helpers moved to `src/occt/wire_ops.ts`.
   - Progress: spline edge builders moved to `src/occt/spline_edges.ts`.
   - Commits: `3e7cfec`, `7052684`, `171dc14`, `9c86866`, `f6b0277`
8. [ ] Convert `backend_occt.ts` into orchestration-focused class with module imports.
   - Progress: typed operation contexts now gate extracted modules instead of backend-instance passthrough.
   - Progress: shell and sweep feature executors moved behind explicit module boundaries.
9. [x] Extract thread execution helper cluster.
   - Progress: `execThread` geometry/build path moved to `src/occt/thread_ops.ts`.
   - Regression coverage: added left-vs-right handedness topology consistency check in `src/tests/occt.thread.e2e.test.ts`.
   - Commit: `89ad968`
10. [x] Extract hole execution helper cluster.
   - Progress: `execHole` geometry/cut orchestration moved to `src/occt/hole_ops.ts`.
   - Regression coverage: hole e2e suites + hole wizard depth parity probe re-run on extracted path.
   - Commit: `f02131a`
11. [x] Extract sketch entity segment expansion cluster.
   - Progress: `sketchEntityToSegments`/slot expansion moved to `src/occt/sketch_segments.ts`.
   - Regression coverage: added `sketch.slot` extrusion coverage in `src/tests/occt.sketch_profile_extrude.e2e.test.ts`.
   - Commit: `002c08b`
12. [x] Extract pattern execution helper cluster.
   - Progress: `execPattern` moved to `src/occt/pattern_ops.ts`.
   - Regression coverage: `occt.pattern.e2e` + selector conformance re-run on extracted path.
   - Commit: `05f211b`
13. [x] Extract unwrap execution helper cluster.
   - Progress: `execUnwrap` and unwrap patch/layout helpers moved to `src/occt/unwrap_ops.ts`.
   - Regression coverage: build + `occt.unwrap.e2e` + `selector_conformance_occt.e2e` + `occt.trim_extend_knit.failure_modes.e2e`.
   - Commit: `b815d75`
14. [x] Extract face-edit execution helper cluster.
   - Progress: `execDeleteFace`/`execReplaceFace`/`execMoveFace`/`execMoveBody`/`execSplitBody`/`execSplitFace` moved to `src/occt/face_edit_ops.ts`.
   - Regression coverage: build + delete/replace failure modes + move face/body probes + split failure/probe/lineage/stability suites.
   - Commit: `082873b`
15. [x] Extract surface-edit execution helper cluster.
   - Progress: `execTrimSurface`/`execExtendSurface`/`execKnit`/`execCurveIntersect` moved to `src/occt/surface_edit_ops.ts`.
   - Regression coverage: build + trim/extend/knit failure/probe suites + `occt.curve_intersect.e2e` + `occt.surface.e2e`.
   - Commit: `cd64523`
16. [x] Extract selection-ledger annotation engine.
   - Progress: boolean/split/fillet/chamfer/draft/hole/prism/revolve ledger-plan + annotation helpers moved to `src/occt/selection_ledger_ops.ts`.
   - Regression coverage: build + selector conformance + boolean lineage/split lineage + split stability/failure + hole/draft/fillet/chamfer + trim/extend/knit probes.
   - Commit: `8cef3f5`
17. [x] Extract geometry metadata + thread execution wrappers.
   - Progress: face/edge metadata + face/cylinder property helpers moved to `src/occt/metadata_ops.ts`; `execThread` orchestration moved to `execThreadFeature` in `src/occt/thread_ops.ts`.
   - Regression coverage: build + extrude/revolve + thread e2e/failure coverage + broad downstream ledger-dependent suites.
   - Commit: `8cef3f5`

Current status of the OCCT backend decomposition queue:
1. The targeted executor extraction queue for `shell`, `sweep` variants, `boolean`, `rib/web`, and `sketch` output assembly is complete.
2. The first optional hardening pass is also complete:
   - `draft` and `mirror` are extracted
   - feature-scoped backend errors are standardized for those new module paths
   - direct module coverage exists for the remaining feature families touched in this campaign
3. The remaining work is now deeper architecture work rather than boundary cleanup:
   - broader primitive-adapter extraction beyond the sweep/path/transform families
   - wider migration of inline `Error` throws to structured backend errors
   - direct module coverage for other backend-local helpers if they are extracted later

Per-slice safety checks:
- `npm run build -- --pretty false`
- impacted OCCT tests (selectors, extrude/hole/thread, mesh/step as needed)
- commit each slice independently

## P0: Decompose `backend_occt.ts` Into Cohesive Modules

Goal: reduce `src/backend_occt.ts` from monolith to orchestrator + modules while preserving behavior.

Suggested extraction order:
1. `src/occt/selection_collection.ts`
- Move subshape collection and selection-ledger helpers.
- Candidate moves: `collectSelections`, `collectUniqueSubshapes`, selection-ledger plan builders.

2. `src/occt/shape_primitives.ts`
- Move low-level shape constructors and wrappers.
- Candidate moves: `makePnt/makeDir/makeVec/makeAxis/makePrism/makeRevol/...`.

3. `src/occt/profile_resolution.ts`
- Move sketch/profile/wire resolution and plane-basis logic.

4. `src/occt/mesh_export.ts`
- Move `mesh`, `exportStep`, `exportStl`, triangulation helpers.

Acceptance checks per extraction slice:
- `npm run build -- --pretty false`
- Run only impacted tests (for example):
  - `node dist/tests/occt.extrude.e2e.test.js`
  - `node dist/tests/occt.selector_stability.e2e.test.js`
  - `node dist/tests/occt.mesh.e2e.test.js`
  - `node dist/tests/occt.step.e2e.test.js`

## P0: Decompose Runtime Service Router/Handlers

Goal: turn `apps/tf-service/server.mjs` into thin composition root.

Suggested structure:
- `apps/tf-service/routes/*.mjs`
- `apps/tf-service/services/*.mjs`
- `apps/tf-service/stores/*.mjs`
- `apps/tf-service/http_response.mjs` (already added)
- `apps/tf-service/tenant.mjs` (already added)

Next extractions:
1. Document routes (`/v1/documents*`) handler module.
2. Job routes (`/v1/jobs*`) handler module.
3. Asset/artifact routes handler module.
4. Build/mesh/export enqueue orchestration module.

Acceptance checks per slice:
- `npm run build -- --pretty false`
- `node dist/tests/runtime_service.e2e.test.js`
- `node dist/tests/tf_service_client.e2e.test.js`

## P1: Unify IR Contract Sources

Goal: reduce manual drift between:
- `src/ir.ts`
- `src/ir_schema.ts`
- `src/ir_validate.ts`

Plan:
1. Introduce generated schema/validator from a canonical contract source.
2. Add parity test that fails on contract drift.
3. Keep external `IR_SCHEMA` payload shape source-compatible.

Acceptance checks:
- `npm run build -- --pretty false`
- `node dist/tests/validation.e2e.test.js`
- `node dist/tests/dsl.roundtrip.e2e.test.js`

## P1: Complete Real Package Ownership

Goal: finish replacing package forwarders/placeholders with package-owned source.

Targets:
- `packages/tf-dsl`
- `packages/tf-backend-ocjs`
- `packages/tf-backend-native`
- `packages/tf-export`

Requirements:
- Keep root `trueform` compatibility facade stable.
- Add cross-package parity tests per extracted surface.

## P2: Additional Guardrails

1. Add guardrail to block new duplicate resolution-context builders.
2. Add guardrail for selector slot utility duplication.
3. Add architectural module-boundary checks for runtime route/service/store layers.

## Execution Rules

1. Refactor in small, behavior-preserving slices.
2. Build + impacted tests on each slice.
3. Commit each slice independently.
4. Do not combine backend decomposition and runtime routing decomposition in the same commit.
