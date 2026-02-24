# Pre-Feature Sprint Board

Updated: 2026-02-24
Status: active
Owner: runtime/core

Purpose: execute runtime/platform readiness work before starting new modeling feature development.

## Rules

1. Do not start new feature surfaces until all P0 exit gates are green.
2. Keep API payloads backend-agnostic; never leak kernel/topology handles.
3. Every optional runtime capability change requires:
   - capability flag update
   - OpenAPI update
   - success + capability-disabled e2e coverage

## Owners

- `runtime/core`: executor, compiler wiring, cache semantics.
- `runtime/service`: HTTP API, job/session lifecycle, OpenAPI, error contracts.
- `client/web`: viewer/runtime client, worker and browser cache pipeline.
- `platform/qa`: benchmarks, e2e reliability, observability and release gates.

## P0 Board (Must Complete Before Feature Work)

| Ticket | Priority | Owner | Depends On | Deliverable | Exit Criteria |
| --- | --- | --- | --- | --- | --- |
| `PRE-001` Incremental partial build engine | P0 | `runtime/core` | none | `partialBuild` upgrades from hinted full rebuild to true incremental invalidation/reuse in executor. | `/v1/capabilities.optionalFeatures.partialBuild.execution == "incremental"` and full vs incremental equivalence tests pass. |
| `PRE-002` Build sessions lifecycle | P0 | `runtime/service` | `PRE-001` | `POST /v1/build-sessions`, `DELETE /v1/build-sessions/{sessionId}`, and optional `sessionId` on build endpoints. | `/v1/capabilities.optionalFeatures.buildSessions.enabled == true` and tenant/session isolation e2e passes. |
| `PRE-003` Partial diagnostics hardening | P0 | `runtime/core` | `PRE-001` | Add deterministic diagnostics keys: `invalidatedFeatureIds`, `reusedFeatureIds`, `failedFeatureId`. | Runtime e2e verifies payload shape and deterministic behavior on repeated edits. |
| `PRE-004` Executor cache wiring in build APIs | P0 | `runtime/core` | `PRE-001` | Wire feature/context hash cache into `buildPart`/`buildPartAsync`; reuse unaffected feature subgraphs. | Repeated-edit benchmark fixture shows material latency reduction and stable output equivalence. |
| `PRE-005` API parity + unsupported-feature error contract | P0 | `runtime/service` | none | Align OCCT.js/native unsupported-feature and validation error payloads; keep OpenAPI in sync. | Contract e2e passes for success, unsupported, and capability-disabled paths across both backends. |
| `PRE-006` Packaging split Phase 1 PR2 completion | P0 | `runtime/core` | none | Finish stable core module extraction in workspace split without behavior changes. | Package typecheck/tests green; compatibility facade unchanged for existing imports. |
| `PRE-007` Metrics baseline for runtime decisions | P0 | `platform/qa` | `PRE-001`,`PRE-002`,`PRE-004` | Emit latency, cache hit/miss, and memory usage metrics from service runtime. | CI/runtime reports expose these metrics and alert on regressions. |

## P1 Board (Can Run In Parallel, Still Pre-Feature)

| Ticket | Priority | Owner | Depends On | Deliverable | Exit Criteria |
| --- | --- | --- | --- | --- | --- |
| `PRE-101` Worker mesh decode + selection overlay pipeline | P1 | `client/web` | none | Move heavy mesh decode/selection overlay work off main thread. | Demo path avoids main-thread stalls during mesh/selection interactions. |
| `PRE-102` IndexedDB mesh/manifest cache | P1 | `client/web` | `PRE-101` | Persist mesh/manifests in browser cache keyed by build/profile/options. | Warm reload path consumes cached assets with deterministic cache invalidation. |
| `PRE-103` Chunked mesh streaming | P1 | `runtime/service` | none | Add chunked mesh payload streaming (SSE status already exists). | Large mesh jobs render progressively from streamed chunks in viewer demo flow. |
| `PRE-104` Persistence/versioning baseline | P1 | `runtime/service` | `PRE-002` | Store IR docs + artifacts with version history and normalization/migration hooks. | Read/write roundtrip tests pass across schema versions used by runtime fixtures. |

## Execution Order

1. Week 1 target: `PRE-001`, `PRE-003`, `PRE-005`.
2. Week 2 target: `PRE-002`, `PRE-004`, `PRE-006`, `PRE-007`.
3. Week 3 target: `PRE-101` to `PRE-104`.

## Feature Development Start Gate

Feature development may resume only when all are true:

1. `PRE-001` through `PRE-007` are complete.
2. Runtime capability flags reflect shipped behavior (no stale placeholders).
3. OpenAPI and `@trueform/service-client` behavior match runtime e2e assertions.
4. Benchmark trend shows no regression on repeated-edit latency or memory stability.

## Status Snapshot (2026-02-24)

- `PRE-001` completed.
  - Incremental execution + reuse diagnostics are active in executor and runtime e2e.
- `PRE-002` completed.
  - Build session lifecycle endpoints + tenant isolation coverage are active.
- `PRE-003` completed.
  - Partial diagnostics include invalidated/reused/failed feature fields.
- `PRE-004` completed.
  - Part/build cache keys are wired through runtime build paths with reuse assertions.
- `PRE-005` completed.
  - Capability/OpenAPI/runtime e2e contracts cover optional endpoint surfaces.
- `PRE-006` pending.
  - Packaging split Phase 1 PR2 extraction work remains open.
- `PRE-007` completed.
  - Runtime `/v1/metrics` now exposes cache, queue, job-latency, and memory snapshots with e2e checks.
- `PRE-101` completed.
  - Viewer mesh decode + selection overlay prep run through `tools/viewer/mesh-worker.js` with fallback.
- `PRE-102` completed.
  - Viewer JSON assets (mesh/selector/manifest) now use IndexedDB cache with deterministic TTL invalidation.
- `PRE-103` completed.
  - Runtime mesh assets support chunked NDJSON stream at `/v1/assets/mesh/{assetId}/chunks`.
- `PRE-104` completed (baseline).
  - Documents support logical `docKey` version history with migration hooks and `/v1/documents/{docId}/versions`.
