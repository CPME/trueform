# Vision Gap Bridge Plan (2026-03-01)

Status: Draft
Owner: core/runtime/docs

Purpose: define a concrete path from the current v1 implementation to the broader
TrueForm vision described in `AGENTS.md`, while reducing drift between code,
public docs, and durable specs.

## Why This Plan Exists

The codebase already spans all four vision layers:

- DSL authoring
- IR as the canonical interchange
- kernel execution via OCCT.js and experimental native OCCT
- runtime APIs for application builders

The gap is not direction. The gap is consistency, maturity, and packaging:

- the implementation is broader than some core specs describe
- multiple v1 contracts are still marked as "direction" rather than fully implemented
- the runtime/platform surface is ahead of the canonical architecture summary
- the workspace split exists, but the root package still carries most real logic

This plan closes those gaps in a way that preserves the current stable part
compile contract.

## Current State Snapshot

### What Is Real Today

- Stable root library facade with explicit subpaths:
  - `trueform`
  - `trueform/backend`
  - `trueform/backend-spi`
  - `trueform/experimental`
  - `trueform/api`
  - `trueform/export`
- Deterministic part compile pipeline:
  - normalized IR
  - dependency DAG
  - deterministic feature order
  - backend execution
- Incremental part rebuild support exists in the executor.
- Runtime HTTP service exists for build, mesh, export, artifacts, sessions, and jobs.
- Native OCCT integration exists as:
  - TS transports/backends in `trueform/experimental`
  - a separate native C++ server
- The implemented feature surface is materially larger than the original v1 summary.

### What Is Still Partial

- Assembly intent exists in IR, but core compile ignores assemblies.
- Functional tolerancing intent and assertions exist in IR, but core compile treats
  them as data-first placeholders rather than first-class build outputs.
- `.tfa` assembly container direction is documented, but not yet a complete schema +
  tooling implementation.
- Workspace packages exist, but most package entrypoints are still placeholders or
  forwarders to root `src/` code.
- Some specs still describe an earlier, narrower system than the current code.

## Bridge Goals

1. Align the architecture docs with the implemented system so the source-of-truth
docs describe the actual repo, not the earlier design only.
2. Finish the v1 contract boundaries so "direction" items become explicit shipped
behavior or are clearly deferred.
3. Turn the current single-package-plus-subpaths implementation into the intended
multi-package architecture without breaking stable imports.
4. Promote the API/runtime layer from "present but adjacent" into a first-class part
of the documented platform story.
5. Keep the webapp constraints intact:
   - no browser-side B-Rep leakage
   - async-friendly runtime execution
   - deterministic selectors
   - mesh/view separation

## Semantic Topology Rule

Semantic topology is a required architectural constraint for the bridge work, not
an optional implementation detail.

Definition for this plan:

- features must continue to reference geometry through semantic selectors, named
  selections, and datums rather than transient kernel topology
- backend execution must preserve and propagate stable selection semantics across
  create/modify/split/merge operations
- runtime and exported metadata must expose stable semantic references, never raw
  topology ids, as the integration contract

Required behavior for all new features, especially geometric features:

1. Accept semantic inputs:
   - selectors
   - named selections
   - datums
2. Emit semantic outputs that can be re-resolved on rebuild:
   - stable owner keys
   - `createdBy`
   - role/slot metadata where applicable
   - lineage for created/modified/split/merged topology
   - aliases when semantic continuity requires them
3. Preserve semantic topology through feature composition:
   - downstream features must resolve against the semantic layer, not ad hoc kernel
     traversal
   - feature work that cannot preserve the semantic layer must fail explicitly
4. Carry semantic topology through docs and tests:
   - docs must describe the intended stable-reference behavior
   - tests must cover semantic continuity, not only geometry existence

This rule applies across every workstream below.

## Concise Stage Summary

Stage 1: Align The Contract
- Refresh the source-of-truth docs so they match the shipped system.
- Make semantic topology explicit in architecture, runtime, and feature docs.
- Reduce all "direction vs shipped" ambiguity before expanding scope.

Stage 2: Finish The V1 Boundary
- Convert placeholder v1 areas into explicit implemented or deferred behavior.
- Make assertions, dimensions, and stable semantic references part of the runtime
  contract where applicable.
- Decide the exact scope of assembly and `.tfa` behavior for v1.

Stage 3: Make The Package Layout Real
- Complete the package split without breaking stable imports.
- Move real module ownership into package-local sources.
- Keep semantic topology contracts stable while code moves.

Stage 4: Consolidate And Promote
- Elevate the runtime platform into the main architecture story.
- Promote feature maturity only when semantic topology continuity is verified.
- Keep docs, capabilities, and staged feature policy synchronized.

## Suggested Multi-Agent Split

Yes. These tasks can be split across multiple agents if one agent owns each
workstream and one integrator agent controls merge order and handoffs.

Recommended agent roles:

- Agent 0: Integrator
  - owns sequencing, branch hygiene, merge order, conflict resolution, and final
    consistency review
  - owns cross-workstream signoff on semantic topology invariants
- Agent 1: Contract Docs Agent
  - owns Workstream A
  - leads Stage 1
  - updates source-of-truth architecture and contract docs
- Agent 2: V1 Contract Agent
  - owns Workstream B
  - leads Stage 2
  - turns placeholder v1 behavior into explicit implemented/deferred contract
- Agent 3: Packaging Agent
  - owns Workstream C
  - leads Stage 3
  - performs package extraction while preserving compatibility and semantic
    topology behavior
- Agent 4: Runtime Platform Agent
  - owns Workstream D
  - co-leads Stage 2 for runtime payload work and leads runtime-facing parts of
    Stage 4
  - aligns service, OpenAPI, capabilities, and client-facing payload contracts
- Agent 5: Feature Maturity Agent
  - owns Workstream E
  - supports Stage 2 with semantic topology criteria
  - leads feature graduation and new geometric feature compliance in Stage 4

Parallelism rules:

1. Safe parallel tracks
   - Agent 1 and Agent 4 can work in parallel on different docs only if they do
     not edit the same source-of-truth files in the same batch.
   - Agent 2 and Agent 4 can work in parallel during Stage 2 if Agent 2 defines
     the contract first and Agent 4 implements runtime-visible payload changes
     against that contract.
   - Agent 5 can prepare feature criteria and test templates while Stages 1-3 are
     in progress, but should not promote features before Stage 4.
2. Serialized handoffs
   - Agent 3 should begin large package moves only after Agent 2's contract
     outputs are merged.
   - Agent 5 should begin feature promotion only after Agent 3 stabilizes package
     boundaries and Agent 4 stabilizes runtime-facing contracts.
3. Merge discipline
   - Agent 0 merges Stage 1 outputs first.
   - Agent 0 merges Stage 2 contract-defining changes before runtime or package
     follow-ons.
   - Agent 0 keeps semantic topology contract changes in one reviewable thread so
     downstream agents are not guessing at the stable metadata shape.

Recommended task split to hand out:

- Give Agent 1:
  - `specs/summary.md`
  - `specs/spec.md`
  - `docs/reference/architecture.md`
  - `docs/reference/file-format.md`
  - import-path correctness sweeps in public docs
- Give Agent 2:
  - `specs/v1-contract.md`
  - contract updates for assertions/dimensions/assemblies
  - the minimum semantic topology contract definition
- Give Agent 3:
  - `packages/*`
  - root compatibility facades
  - boundary guardrails and package-level tests
- Give Agent 4:
  - `src/api.ts`
  - `apps/tf-service/server.mjs`
  - `src/service_client.ts`
  - runtime docs/OpenAPI alignment
- Give Agent 5:
  - `src/feature_staging.ts`
  - feature-specific docs
  - feature e2e and probe tests
  - semantic topology continuity checks for new geometric features

## Workstream A: Documentation And Contract Alignment

Goal: make the documentation hierarchy accurately reflect the implemented system.

Suggested owner: Agent 1 (Contract Docs Agent)

### Problems To Solve

- `specs/summary.md` understates the implemented feature surface and still reflects
  older output assumptions.
- `specs/spec.md` is valuable as a conceptual architecture spec, but parts of it no
  longer match active package naming or the runtime platform shape.
- `docs/reference/file-format.md` documents `.tfa` direction ahead of actual schema
  support, which is acceptable only if the "draft" boundary is made explicit and
  kept narrow.
- some secondary docs still point users to import paths that are no longer correct.

### Deliverables

1. Refresh `specs/summary.md` to match:
   - implemented feature families
   - named outputs
   - actual staging status
   - runtime/API scope
2. Split `specs/spec.md` into:
   - architecture invariants that are true now
   - future target architecture clearly labeled as target state
3. Tighten `docs/reference/file-format.md` wording so:
   - `.tfp` is documented as implemented
   - `.tfa` is documented as draft/in-progress only
   - unsupported shape fields are not presented as fully landed behavior
4. Audit docs for import-path correctness, especially experimental/native examples.
5. Update `specs/docs-map.md` whenever a new durable architecture or migration doc
   becomes a source-of-truth reference.

### Exit Criteria

- A reader can identify what is shipped, experimental, and draft without reading code.
- Public docs, `README.md`, `specs/summary.md`, and `specs/v1-contract.md` do not
  contradict each other on feature scope, packaging, or import paths.

## Workstream B: Complete The V1 Contract

Goal: close the most important "represented but not fully integrated" parts of v1.

Suggested owner: Agent 2 (V1 Contract Agent)

### Problems To Solve

- Assemblies exist in the model, but they are not part of the stable compile path.
- Constraints and assertions are represented in IR, but not surfaced consistently as
  runtime/build results.
- Container and assembly storage contracts are ahead of implementation.

### Deliverables

1. Make assembly handling explicit in one of two ways:
   - implement the next intended loader/runtime path, or
   - formally freeze assemblies as experimental/data-only for the remainder of v1
2. Promote assertions and dimension/constraint evaluation into documented build
   outputs for runtime clients.
3. Decide and document the exact v1 boundary for `.tfa`:
   - parser support
   - writer support
   - import resolution behavior
   - compatibility with legacy bundled documents
4. Ensure every v1 contract claim has:
   - a test
   - a capabilities/API declaration if runtime-visible
   - a stable doc reference
5. Define the minimum semantic topology contract for v1:
   - what selection metadata is stable
   - what lineage forms must be preserved
   - where explicit failure is required when continuity cannot be guaranteed

### Exit Criteria

- There are no major v1 contract items that exist only as types plus warnings.
- The "v1 direction" sections can be reduced to either "implemented" or "deferred".

## Workstream C: Package Architecture Migration

Goal: move from the current compatibility facade to the intended multi-package
layout.

Suggested owner: Agent 3 (Packaging Agent)

### Problems To Solve

- Workspaces exist, but most packages are placeholders.
- Core logic still primarily lives in root `src/`.
- The conceptual architecture says "modular packages", while the operational
  architecture is still "single package with explicit subpaths".

### Deliverables

1. Complete `tf-core` extraction:
   - IR
   - compiler
   - executor
   - validation
   - selectors
   - cache/profile helpers
2. Complete `tf-dsl` extraction:
   - authoring helpers
   - no backend imports
3. Complete backend package extraction:
   - `tf-backend-ocjs`
   - `tf-backend-native`
4. Complete export package extraction:
   - STEP/GLB/3MF/DXF/SVG tooling
5. Keep `trueform` as a compatibility facade during the transition with explicit
   tests for export identity and import compatibility.

### Guardrails

- No stable root import breakage during the transition phases.
- No kernel-shaped SPI types leaked back into the stable root package.
- Package extraction must improve, not blur, boundary enforcement.
- Package moves must not regress semantic topology metadata shape or selector
  behavior.

### Exit Criteria

- Package-local sources are primary, not forwarders.
- The root package is demonstrably a facade over package modules rather than the
  only real implementation location.

## Workstream D: Runtime/API As A First-Class Platform Layer

Goal: make the API layer part of the core architecture story, not an adjacent app.

Suggested owner: Agent 4 (Runtime Platform Agent)

### Problems To Solve

- The runtime service is real and substantial, but most high-level architecture docs
  still describe only the DSL -> backend path.
- The API contract, job model, and asset pipeline are underrepresented in the
  current architecture narrative.

### Deliverables

1. Elevate the architecture docs to include:
   - runtime service
   - async jobs
   - build sessions
   - asset/artifact retrieval
   - capability discovery
2. Clarify which runtime APIs are:
   - stable contract
   - optional capability-gated
   - experimental
3. Ensure runtime endpoints and capability flags stay synchronized with docs and
   OpenAPI definitions.
4. Keep runtime payloads backend-agnostic:
   - no OCCT handles
   - no raw topology ids
   - semantic references, mesh, and diagnostics only
5. Document which runtime payload fields constitute the stable semantic topology
   contract for clients.

### Exit Criteria

- The documented architecture includes the runtime platform as part of the product.
- App builders can understand the intended integration path without reverse
  engineering `apps/tf-service/server.mjs`.

## Workstream E: Feature Surface Maturity And Promotion

Goal: align advertised capability with feature reliability and staging policy.

Suggested owner: Agent 5 (Feature Maturity Agent)

### Problems To Solve

- The feature surface has expanded quickly.
- Some features are correctly marked as staging, but docs/specs are not fully
  synchronized.
- Promotion decisions need to be tied to visual signoff, parity, and runtime
  capability reporting.

### Deliverables

1. Reconcile advertised feature lists across:
   - docs homepage
   - summary/spec docs
   - feature staging registry
   - runtime capability output
2. Define graduation criteria for each staging feature:
   - targeted e2e coverage
   - failure-mode coverage where applicable
   - semantic topology continuity evidence
   - required visual review artifacts
3. Require every new geometric feature to:
   - consume semantic selectors
   - emit stable semantic topology metadata
   - preserve or explicitly terminate lineage on topology-changing operations
4. Keep unsupported or partial behaviors explicit with errors, not soft ambiguity.

### Exit Criteria

- Every advertised feature is either:
  - stable
  - staging
  - intentionally omitted from the public contract
- Feature maturity can be understood from one authoritative source.
- No feature is promoted without documented semantic topology behavior and tests.

## Success Metrics

- Zero known contradictions between:
  - `README.md`
  - `docs/`
  - `specs/summary.md`
  - `specs/v1-contract.md`
  - runtime capability reporting
- No major architecture doc claims that require reading code to discover they are
  still draft-only.
- Stable package boundaries are enforced by tests and guardrails, not convention.
- A new contributor can identify:
  - stable API surface
  - experimental API surface
  - draft future direction
  in under 15 minutes from docs alone.
- New geometric features preserve stable semantic references across rebuilds and
  topology-changing operations, or fail explicitly where continuity is not possible.

## Staged Execution Plan

### Stage 1: Align The Contract

Lead agent: Agent 1
Supporting agents: Agent 4 (runtime docs review), Agent 0 (integration review)

- Refresh `specs/summary.md`.
- Refresh `specs/spec.md` framing.
- Fix incorrect example import paths.
- Tighten `docs/reference/file-format.md` draft language.
- Document the semantic topology contract in architecture-facing docs.

Boundary:
- No package moves or new stable feature promotions until architecture and contract
  docs match the shipped system.

### Stage 2: Finish The V1 Boundary

Lead agent: Agent 2
Supporting agents: Agent 4 (runtime payload contract), Agent 5 (semantic topology
feature criteria), Agent 0 (merge ordering)

- Make assertions/dimensions first-class runtime outputs.
- Decide the concrete v1 assembly and `.tfa` boundary.
- Remove or reclassify placeholder-only contract claims.
- Define the minimum stable semantic topology metadata contract for v1.

Boundary:
- The result of this stage is a clear shipped-vs-deferred contract, including stable
  reference behavior.

### Stage 3: Make The Package Layout Real

Lead agent: Agent 3
Supporting agents: Agent 0 (merge control), Agent 2 (contract guardrails review)

- Replace package forwarders with package-owned sources.
- Keep root compatibility exports intact.
- Add cross-package contract tests for each extracted module boundary.
- Treat semantic topology metadata and selector behavior as migration invariants.

Boundary:
- Packaging work must preserve API behavior and semantic topology continuity.

### Stage 4: Consolidate And Promote

Lead agents: Agent 4 and Agent 5
Supporting agents: Agent 0 (promotion gate), Agent 1 (final docs coherence)

- Update architecture docs to include runtime APIs and async job execution.
- Keep viewer, service, and native server documentation aligned with the same
  platform model.
- Promote features only after semantic topology continuity is covered by docs,
  tests, and capability/staging policy.

Boundary:
- Feature promotion follows contract completion and packaging stabilization, not the
  other way around.

## Non-Goals For This Plan

- Replacing the current stable part compile contract.
- Turning assembly solve into a required core compile stage.
- Exposing backend internals in stable APIs.
- Allowing docs to advertise speculative capabilities without explicit draft labels.

## Related

- `AGENTS.md`
- `specs/docs-map.md`
- `specs/summary.md`
- `specs/spec.md`
- `specs/v1-contract.md`
- `specs/packaging-split-timeline.md`
- `specs/webapp-runtime-two-milestones.md`
