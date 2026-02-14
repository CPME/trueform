# Runtime Improvement Tracker (Tightened)

Updated: 2026-02-14
Source: `/home/eveber/code/truecad/TRUEFORM_PROPOSALS.md`

## Do Now (executed)

- API contract hardening
  - Added `trueform/api` + `@trueform/api` surface with typed endpoints and runtime job/request contracts.
  - Added OpenAPI publication at `GET /v1/openapi.json`.
  - Standardized job envelope to always include both `id` and `jobId`.
- Partial build contract
  - Added `POST /v1/build/partial` and `POST /v1/jobs/build/partial`.
  - Added hint payload support (`partial.changedFeatureIds`, `partial.selectorHints`).
  - Added deterministic partial diagnostics (`diagnostics.partialBuild`), with explicit execution mode.
- Capability-gating
  - Added `optionalFeatures` to `/v1/capabilities` to machine-gate optional roadmap surfaces.
  - Current advertised state:
    - `partialBuild.endpoint: true`
    - `partialBuild.execution: "hinted_full_rebuild"`
    - `buildSessions.enabled: false`
    - `assembly.solve/preview/validate: false`
    - `bom.derive: false`
    - `release.preflight/bundle: false`
    - `pmi.stepAp242/supportMatrix: false`

## Defer

- True incremental execution engine
  - Keep as one epic: dependency graph + cache invalidation + context reuse.
  - Includes former "build sessions" concept (do not track separately).
- Assembly runtime surface
  - Start with one endpoint (`/v1/assembly/solve`) when solver/runtime payloads are ready.
  - Add preview/validate split only after measured need.
- Durable production hardening
  - Auth/policy hooks, telemetry schema, and durable persistence after runtime core semantics stabilize.

## Drop or Merge

- Drop separate `/v1/export/step-ap242-pmi` endpoint.
  - Keep a single `/v1/export/step` surface with options.
- Move BOM/release endpoints out of core CAD runtime backlog.
  - Treat as orchestration-layer concerns unless directly required by core runtime consumers.

## Execution Rule

- Any new optional endpoint must be accompanied by:
  - capability flag under `/v1/capabilities.optionalFeatures`
  - OpenAPI entry in `/v1/openapi.json`
  - e2e coverage for both success path and capability-disabled path
