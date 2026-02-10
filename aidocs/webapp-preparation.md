# Webapp Preparation Plan (TrueForm)

This document captures the plan for making TrueForm usable as part of a CAD webapp, with a focus on interactive modeling and a path to multi-tenant SaaS while remaining open-source friendly.

## Summary
TrueForm already provides a strong IR/DSL and OCCT-based execution, but it is not yet structured as a production webapp stack. The key missing pieces are:
- a stable backend API for build/mesh/export
- async job execution with caching
- backend parity between OCCT native and OCCT.js
- a production viewer/client runtime
- persistence/versioning and multi-tenant boundaries

Status key: `[x]` done, `[ ]` todo, `[~]` partial

## Plan (Full-Stack Readiness)

1. [x] Define the webapp architecture contract
- [x] Formalize a stable HTTP/JSON API that covers build, mesh, export, and selection metadata. (Drafted in `aidocs/runtime-contract.md`.)
- [x] Version the IR and all API responses. (Specified in the contract.)
- [x] Define backend-agnostic selector semantics and required selection metadata keys. (Specified in the contract.)

2. [~] Backend compute service (async + safe)
- [x] Build a dedicated CAD compute service with async job endpoints: build, mesh, export. (Mock runtime server in `tools/runtime/server.mjs`.)
- [~] Add job IDs and progress reporting. (Implemented job IDs + progress; cancellation/timeouts pending.)
- [ ] Enforce CPU/memory quotas and session isolation for multi-tenant safety.

3. [ ] Feature parity and selector semantics
- Expand native OCCT server beyond extrude-only support.
- Align feature behavior and selector metadata between OCCT.js and native OCCT.
- Add explicit error reporting for unsupported features in any backend.

4. [ ] Incremental build and cache integration
- Wire build cache into buildPart/buildPartAsync using feature hashes and context hashes.
- Cache per-feature outputs and mesh artifacts.
- Store caches in content-addressable storage to dedupe across parts and tenants.

5. [ ] Mesh pipeline for web use
- Implement mesh profiles (interactive/preview/export) and progressive refinement.
- Stream mesh chunks and edge overlays.
- Avoid rebuilding mesh when geometry is unchanged.

6. [ ] Assembly support and instancing
- Implement assembly build/mesh manifests with instance transforms.
- Ensure instancing reuses cached geometry instead of duplicating it.
- Integrate assembly solver for constraint-driven editing workflows.

7. [~] Frontend viewer and client runtime
- [~] Promote the viewer to a production client library. (Viewer now integrates with the runtime API but is not production-grade yet.)
- [ ] Web worker pipeline for mesh decoding and selection overlays.
- [ ] IndexedDB caching for meshes and manifests.
- [ ] Deterministic selection overlays driven by backend metadata.

8. [ ] Persistence, versioning, and collaboration
- Store IR documents, parameters, and build artifacts with version history.
- Add schema migrations and IR normalization on read/write.
- Optional future: live collaboration via patch streams or CRDT.

9. [ ] Observability, QA, and performance
- Benchmarks for build, mesh, selection resolution, and export.
- Webapp-focused e2e tests for async job flow and caching.
- Service metrics: job latency, cache hit rate, memory usage.

## Strategy (Minimal E2E First)
We will build a thin vertical slice end-to-end before going wide. This minimizes junk code and makes debugging tractable.

Minimal E2E slice definition:
- Frontend: a tiny demo that loads a `.tfp`, tweaks one parameter, calls `/v1/build`, and renders the mesh.
- Runtime: build + mesh + asset return through the HTTP API.
- Data: `.tfp` container as a stand-in for DB storage (later replaced by DB-backed IR).

After the slice works, expand horizontally:
- Add caching validation, timeouts, and cancellation tests.
- Add more parts/features and native OCCT backend support.
- Replace `.tfp` with DB storage and versioned document history.

## Non-negotiables (Webapp Footguns)
- Never leak B-Rep objects to the browser. Keep OCCT shapes server-side and stream meshes.
- Avoid synchronous backend calls for long operations. Use async jobs + polling/streaming.
- Do not rely on stable face/edge IDs. Always re-resolve selectors per rebuild.
- Do not recompute booleans/meshes if inputs are unchanged.
- Use instance transforms for repeated parts.
- Avoid blocking the main thread for mesh or selection tasks in the browser.
