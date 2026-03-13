# Maintainability Refactor Backlog (2026-03-10)

Status: active backlog
Updated: 2026-03-13
Owner: core/runtime

Purpose: track only the remaining maintainability-heavy refactor work after the
first safe decomposition pass.

Related:
- `specs/archive/maintainability-refactor-session-log-2026-03-10.md` -
  completed extraction history

## Current State

The first safe decomposition pass is complete.

Already done and no longer part of the active queue:

- core OCCT helper extractions such as `vector_math`, `selection_resolution`,
  `shape_collection`, `export_ops`, `mesh_ops`, `thread_ops`, `hole_ops`,
  `pattern_ops`, `unwrap_ops`, `face_edit_ops`, `surface_edit_ops`,
  `selection_ledger_ops`, and `metadata_ops`
- runtime helper extraction for HTTP response writing and tenant scoping
- shared normalized-part planning reused by compiler, executor, and build-cache
  flows via `src/part_preparation.ts`
- several feature-boundary extractions (`shell`, `sweep`, `boolean`, `rib/web`,
  `sketch`, `draft`, `mirror`, transform primitives)

The remaining work is deeper architecture cleanup rather than another broad
boundary-extraction sweep.

### Backend Line Count Tracking

- baseline before the recent backend slices: `src/backend_occt.ts` at 5457 lines
- after `Extract OCCT profile-plane adapters` (`693791a`): 5438 lines
- after `Extract OCCT shape primitives` (`233f9bc`): 5415 lines
- after `Extract OCCT profile primitives` (`98430c7`): 5346 lines
- after `Extract OCCT sketch wire builder` (`435accf`): 5312 lines
- after `Extract OCCT curve edge primitives`: 5296 lines

## Outstanding Work

### P0: Finish `src/backend_occt.ts` Decomposition

Goal: reduce `src/backend_occt.ts` to an orchestration-focused class plus
cohesive helper modules.

Open slices:

1. Complete the profile/sketch/plane resolution helper cluster.
- Progress already landed in:
  - `src/occt/profile_resolution.ts`
  - `src/occt/plane_basis.ts`
  - `src/occt/sketch_geometry.ts`
  - `src/occt/wire_ops.ts`
  - `src/occt/spline_edges.ts`
- Additional adapter slice landed in:
  - `src/occt/profile_plane_adapters.ts`
- Primitive profile constructors now live in:
  - `src/occt/profile_primitives.ts`
- Sketch loop/wire assembly now lives in:
  - `src/occt/sketch_wire_builder.ts`
- Curve edge constructors now live in:
  - `src/occt/curve_edge_primitives.ts`
- Remaining work:
  - continue removing the leftover inline resolution glue from `src/backend_occt.ts`
  - tighten module ownership boundaries and direct module coverage where needed

2. Convert `src/backend_occt.ts` into an orchestration-focused class.
- Remove remaining backend-local helper bodies that are now better owned by
  extracted modules.
- Continue replacing inline `Error` throws with structured backend errors where
  the error surface is user-visible or test-critical.

3. Extract `src/occt/shape_primitives.ts` only if it materially reduces backend
   duplication.
- Candidate moves: `makePnt`, `makeDir`, `makeVec`, `makeAxis`,
  prism/revolve helpers, and similar low-level constructors.
- Progress landed in:
  - `src/occt/shape_primitives.ts`
- Remaining work:
  - decide whether more constructor-style OCCT helpers should move into the
    same module or whether the remaining thin delegates are good enough

Acceptance checks per slice:
- `npm run build -- --pretty false`
- impacted OCCT tests only, for example:
  - `node dist/tests/occt.extrude.e2e.test.js`
  - `node dist/tests/occt.selector_stability.e2e.test.js`
  - `node dist/tests/occt.mesh.e2e.test.js`
  - `node dist/tests/occt.step.e2e.test.js`

### P0: Decompose Runtime Service Router/Handlers

Goal: turn `apps/tf-service/server.mjs` into a thin composition root.

Suggested structure:
- `apps/tf-service/routes/*.mjs`
- `apps/tf-service/services/*.mjs`
- `apps/tf-service/stores/*.mjs`

Open slices:
- no remaining P0 route slices in the current queue

Completed in a follow-up slice:
- metadata routes extracted to `apps/tf-service/route_metadata.mjs`
- document and build-session routes extracted to `apps/tf-service/route_documents.mjs`
- job, asset, artifact, and metrics routes extracted to
  `apps/tf-service/route_resources.mjs`
- build/mesh/export/assembly/measure POST action routing extracted to
  `apps/tf-service/route_actions.mjs`
- job enqueue/orchestration and job-envelope helpers extracted to
  `apps/tf-service/job_runtime.mjs`

Acceptance checks:
- `npm run build -- --pretty false`
- `node dist/tests/runtime_service.e2e.test.js`
- `node dist/tests/tf_service_client.e2e.test.js`

### P1: Unify IR Contract Sources

Goal: reduce manual drift between:
- `src/ir.ts`
- `src/ir_schema.ts`
- `src/ir_validate.ts`

Open work:

1. Introduce generated schema/validator from a canonical contract source.
2. Add parity coverage that fails on contract drift.
3. Keep external `IR_SCHEMA` payload shape source-compatible.

Acceptance checks:
- `npm run build -- --pretty false`
- `node dist/tests/validation.e2e.test.js`
- `node dist/tests/dsl.roundtrip.e2e.test.js`

### P1: Complete Real Package Ownership

Goal: finish replacing package forwarders/placeholders with package-owned
source.

Targets:
- `packages/tf-dsl`
- `packages/tf-backend-ocjs`
- `packages/tf-backend-native`
- `packages/tf-export`

Requirements:
- keep the root `trueform` compatibility facade stable
- add cross-package parity tests for each extracted surface

### P2: Additional Guardrails

1. Add guardrail to block new duplicate resolution-context builders.
2. Add guardrail for selector slot utility duplication.
3. Add architectural module-boundary checks for runtime route/service/store
   layers.

## Execution Rules

1. Refactor in small, behavior-preserving slices.
2. Build plus impacted tests on each slice.
3. Commit each slice independently.
4. Do not combine backend decomposition and runtime routing decomposition in the
   same commit.
