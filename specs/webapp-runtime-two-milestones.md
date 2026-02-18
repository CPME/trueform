# Webapp Runtime Two-Milestone Plan

Updated: 2026-02-18
Owner: runtime/core

Purpose: prioritize TrueForm kernel/runtime work that most improves an external webapp integration.

## Milestone 1: Interactive Runtime Foundations

Goal: make runtime behavior webapp-usable under iterative edits before adding more endpoint surface.

### Outcomes

- `partialBuild` moves from `"hinted_full_rebuild"` to true incremental execution.
- build sessions are enabled so the webapp can reuse server-side state across edits.
- local constraints/assertions become first-class build outputs (not only warnings).
- runtime diagnostics become actionable for client UX (cache hit reason, skipped features, failing feature id).

### Scope

1. Incremental part execution engine
- Add per-feature invalidation in executor based on dependency graph + normalized feature hash.
- Reuse upstream kernel results for unaffected feature subgraphs.
- Keep deterministic output equivalence with full rebuild.

2. Build sessions
- Add session-scoped build cache with TTL + explicit disposal.
- Add endpoint(s):
`POST /v1/build-sessions`
`DELETE /v1/build-sessions/{sessionId}`
- Accept optional `sessionId` in:
`POST /v1/build`
`POST /v1/build/partial`

3. Constraint/assertion evaluation in build response
- Evaluate:
`evaluatePartDimensions`
`evaluatePartAssertions`
- Return structured non-fatal diagnostics payload under `result.validation`.

4. Runtime diagnostics hardening
- Extend `diagnostics.partialBuild` to include:
`invalidatedFeatureIds`
`reusedFeatureIds`
`failedFeatureId`
- Keep existing deterministic diagnostics fields.

### Code Touchpoints

- `src/executor.ts`
- `src/build_cache.ts`
- `src/compiler.ts`
- `src/dimensions.ts`
- `src/assertions.ts`
- `src/api.ts`
- `apps/tf-service/server.mjs`
- `src/service_client.ts`

### Test Plan

- Update/add:
`src/tests/runtime_service.e2e.test.ts`
`src/tests/build_cache.e2e.test.ts`
`src/tests/dimensions.e2e.test.ts`
`src/tests/assertions.e2e.test.ts`
`src/tests/tf_service_client.e2e.test.ts`
- New coverage expectations:
incremental build reuses unaffected features, session lifecycle, validation payload shape, session isolation by tenant.

### Definition of Done

- `/v1/capabilities.optionalFeatures.partialBuild.execution` is `"incremental"`.
- `/v1/capabilities.optionalFeatures.buildSessions.enabled` is `true`.
- Partial edit latency materially improves on repeated edits in runtime e2e benchmark fixture.
- Full vs incremental builds produce equivalent outputs/selection metadata for covered fixtures.

## Milestone 2: Assembly Runtime + Feature Maturity Expansion

Goal: expose assembly solve to runtime clients and widen modeling coverage with reliability gates.

### Outcomes

- assembly solving is available via async runtime endpoint(s).
- solve output is consumable by webapp (instance transforms + residual diagnostics).
- staged feature surface is reduced by graduating robust items.
- high-value feature gaps are closed with deterministic selector behavior.

### Scope

1. Assembly solve runtime surface
- Add endpoint(s):
`POST /v1/assembly/solve`
`POST /v1/jobs/assembly/solve`
- Wire to `solveAssembly` using built part connector frames.
- Return:
`instances[]` transforms, `converged`, `iterations`, `residual`, mate-level residual summary.

2. Capability gating + client support
- Flip `/v1/capabilities.optionalFeatures.assembly.solve` to `true` once endpoint passes e2e.
- Add client helpers in `TfServiceClient` for assembly solve + polling.

3. Staged feature graduation pass
- Promote candidates only when conformance + reliability tests pass:
`feature.draft`
`feature.thread`
surface-mode feature keys in `src/feature_staging.ts`.
- Keep hard failures where backend coverage is still incomplete.

4. High-value feature gap closure
- Prioritize currently declared-but-missing behavior that blocks app scenarios:
`extrude(..., "throughAll")`
selected `pipeSweep` path limitations
any selector ambiguity regressions introduced by new feature work.

### Code Touchpoints

- `src/assembly_solver.ts`
- `src/assembly.ts`
- `src/connectors.ts`
- `src/api.ts`
- `src/service_client.ts`
- `apps/tf-service/server.mjs`
- `src/backend_occt.ts`
- `src/feature_staging.ts`

### Test Plan

- Update/add:
`src/tests/runtime_service.e2e.test.ts`
`src/tests/assembly.solver.e2e.test.ts`
`src/tests/assembly.mate_dof.e2e.test.ts`
`src/tests/feature_staging.e2e.test.ts`
feature-specific OCCT e2e tests for each gap closed.
- New coverage expectations:
successful assembly solve, non-converged solve payload, invalid connector/instance references, staged feature policy behavior after graduation.

### Definition of Done

- `/v1/capabilities.optionalFeatures.assembly.solve` is `true`.
- Assembly solve endpoint is documented in OpenAPI and covered by runtime e2e.
- At least one staged feature is promoted to stable with matching staging registry update and tests.
- Feature gap closures include per-feature e2e coverage and docs updates.

## Sequencing Rules

- Ship Milestone 1 before enabling assembly solve in runtime.
- Keep backend-agnostic API payloads; do not leak OCCT handles or topology ids.
- Every optional endpoint/change requires:
capability flag update, OpenAPI update, and e2e coverage.

