# V1 Product Contract (Draft)

Status: Draft (Step 1 in progress)
Date: 2026-02-11

## Purpose

Define a single, explicit v1 contract for compile semantics, assembly scope,
and public API stability tiers.

## Core Contract

1. Canonical source of truth:
   - IR is canonical, JSON-serializable, and kernel-agnostic.
   - Kernel history and B-Rep internals are not serialized in IR.
2. Compile contract:
   - Core deterministic compile is part-centric in v1.
   - Selector ambiguity is a compile/build error.
   - Stable references resolve through datums, selectors, and named selections,
     not raw kernel topology ids.
3. Backend contract:
   - Backends execute normalized feature intent.
   - Backends must preserve semantic topology metadata where continuity is
     deterministically known, and fail explicitly where it is not.
   - Backend internals stay out of stable authoring contracts.

## Stable Reference Contract (v1)

1. Stable reference model:
   - Stable references are expressed through:
     - datums
     - selectors
     - named selections
   - Raw kernel face/edge ids are not part of the stable contract.
2. Semantic topology continuity:
   - Topology-changing features should preserve semantic continuity through
     selection metadata such as:
     - `createdBy`
     - owner keys
     - role/slot metadata where applicable
     - lineage (`created`, `modified`, `split`, `merged`)
     - aliases where semantic continuity requires them
3. Failure behavior:
   - If a feature cannot preserve stable semantic references for a claimed
     workflow, it must fail explicitly rather than silently degrade to unstable
     topology traversal.
4. Scope:
   - This is a stable contract for part workflows.
   - Runtime payloads may expose semantic references and diagnostics derived from
     this layer, but must not expose raw kernel topology ids.

## Assembly Contract (v1 direction)

1. Connectors:
   - Mate connectors are authored and stored at the part level.
2. Storage:
   - Assembly intent is stored in a separate assembly file/document.
   - Assembly documents are safe to evolve as a data contract before solver
     maturity, as long as they resolve through stable part-level connector
     definitions.
3. Solver scope:
   - Assembly solving helpers can exist as experimental utilities.
   - Assembly solving is not a required stage of core deterministic part compile.
   - Assembly solver/runtime behavior should not be treated as production-stable
     until the required part-level semantic reference and connector behavior is
     stable for the dependent workflows.

## Assembly Part Reference Shape (Step 1 draft)

Assembly documents define part dependencies through `document.imports`.

Draft import entry:
- `id`: local import key (for example `part:plate`).
- `path`: relative path to a `.tfp` part container.
- `partId`: part id inside the referenced part document.
- `documentHash` (optional): hash lock for deterministic resolution.

Draft resolution rule:
- `AssemblyInstance.part` resolves against `document.imports[].id`.
- Assembly connectors are resolved from the referenced part's connector definitions.

## Bundle Transition Strategy (Step 1 decision)

Current legacy shape:
- A single document may contain both `parts` and `assemblies`.

Target shape:
- Part intent lives in `.tfp` part containers.
- Assembly intent lives in `.tfa` assembly containers with `document.imports`.

Compatibility behavior:
1. Reader compatibility:
   - Readers must accept legacy single-document bundles during transition.
   - When reading a legacy bundle, loaders create virtual imports using
     `part:<part.id>` keys so assembly instance references can resolve through
     one import path.
2. Writer default:
   - New write flows default to split output (`.tfa` + referenced `.tfp` parts).
   - Legacy bundle write mode is allowed only as an explicit compatibility option.
3. Build/compile behavior:
   - Core part compile stays unchanged.
   - Assembly loaders must resolve instances through import keys (virtual or explicit).

Deprecation timeline (version-gated, not date-gated):
1. v0.x transition start:
   - Read legacy bundles and split format.
   - Write split by default; legacy bundle write remains opt-in.
2. next minor after transition:
   - Emit warning when writing legacy bundle mode.
3. next major:
   - Remove legacy bundle write support.
   - Keep legacy bundle read support as compatibility mode.

## API Stability Tiers

Stable:
- IR types and schema identifiers.
- DSL authoring helpers for core features.
- Core compile/build contracts for parts.
- Stable semantic reference behavior for part workflows.
- Root package entrypoint (`trueform`) is limited to stable core APIs.

Experimental:
- Assembly solver helpers.
- Native transport variants and any backend-specific extension hooks.
- Exposed only through `trueform/experimental`.

Backend SPI:
- Kernel-facing/backend-facing contracts used to implement backends.
- Must be exposed through explicit backend/spi entry points, not root API.
- Exposed through `trueform/backend-spi`.

## Root Export Policy (Step 1 decision)

Allowed root (`trueform`) exports:
- IR + schema contracts.
- DSL helpers and types.
- Core compile/build APIs for part workflows.
- Core assertion/cache/profile helpers that do not expose backend internals.

Disallowed root exports:
- Backend implementation classes (`OcctBackend`, native transports, etc.).
- Kernel-shaped SPI contracts (`KernelObject`, `KernelResult`, etc.).
- Experimental assembly solver/runtime helpers.
- Export-tooling functions (STEP/GLB/STL helper entrypoints).

Required explicit subpaths:
- `trueform/backend` for backend implementations.
- `trueform/backend-spi` for backend interfaces/adapters.
- `trueform/experimental` for unstable runtime APIs.
- `trueform/export` for export tooling.

Semver policy:
- Root + stable subpaths follow normal semver compatibility.
- `trueform/experimental` may change between minors with deprecation notes.
- Breaking root export additions/removals require contract + guardrail updates.

## Documentation Alignment Requirements

The following docs must remain consistent with this contract:
- `README.md`
- `docs/reference/dsl/assembly.md`
- `docs/reference/file-format.md`
- `specs/summary.md`
- `specs/docs-map.md`

## Open Items

- Package split execution and package naming finalization.

## Related

- Packaging split timeline: `specs/packaging-split-timeline.md`
