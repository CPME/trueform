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
   - Commits: `3e7cfec`, `7052684`, `171dc14`, `9c86866`
8. [ ] Convert `backend_occt.ts` into orchestration-focused class with module imports.

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
