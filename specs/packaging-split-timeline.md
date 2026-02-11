# Packaging Split Timeline (Draft)

Date: 2026-02-11
Status: Draft

## Goal

Move from the current single package (`trueform`) to a clearer multi-package
layout without breaking stable API contracts.

## Target Layout

- `packages/tf-core`: IR, schema, compiler, validation, selectors.
- `packages/tf-dsl`: DSL authoring helpers, no backend imports.
- `packages/tf-backend-ocjs`: OCCT.js backend implementation.
- `packages/tf-backend-native`: native transport/client adapters.
- `packages/tf-export`: STEP/GLB/3MF/SVG/DXF tooling.
- `apps/viewer`: viewer runtime/tooling.
- `apps/occt-server`: native server app.

Proposed public package names:
- `@trueform/core` -> `packages/tf-core`
- `@trueform/dsl` -> `packages/tf-dsl`
- `@trueform/backend-ocjs` -> `packages/tf-backend-ocjs`
- `@trueform/backend-native` -> `packages/tf-backend-native`
- `@trueform/export` -> `packages/tf-export`
- `trueform` remains aggregate compatibility facade during transition.

## Transition Phases

Phase 0 (now): single package with explicit subpaths.
- Keep `trueform` root as stable core.
- Enforce `trueform/backend`, `trueform/backend-spi`, `trueform/export`,
  `trueform/experimental`.
- CI guardrails enforce boundary policy.

Phase 1: workspace scaffolding.
- Introduce workspace folders and package manifests.
- Keep top-level `trueform` as compatibility facade.
- Re-export from new package locations without behavior changes.

Phase 2: internal dependency inversion.
- Enforce no backend imports in `tf-core` and `tf-dsl`.
- Move backend implementations and export tools fully out of core package.
- Add package-level tests for cross-package contract boundaries.

Phase 3: public package cutover.
- Publish package-level entrypoints (`@trueform/core`, etc.).
- Keep `trueform` as aggregate compatibility package for one major cycle.
- Provide migration guides and codemod recipes for imports.

## Compatibility Policy

- Stable root APIs remain source-compatible through Phases 0-2.
- New APIs should land in package-specific entrypoints first.
- Experimental APIs stay explicitly unstable across phases.

## Exit Criteria

Before closing Phase 0:
- Root export policy is documented and enforced by CI.
- Docs reflect stable vs backend-spi vs experimental import paths.

Before closing Phase 1:
- Workspace package boundaries exist with green tests.
- No behavior regressions in build/export/selector conformance tests.

Before closing Phase 2:
- Core packages have no direct backend implementation imports.
- Cross-package compatibility tests are green in CI.

## PR Breakdown (Execution Draft)

PR 1: workspace scaffolding only.
- Add workspace config + package manifests.
- No source movement; no API behavior changes.

PR 2: extract stable core modules.
- Move/copy core modules into `packages/tf-core`.
- Keep top-level facade re-exports intact.
- PR 2a completed: introduced `src/core.ts` and mapped workspace `@trueform/core`
  to the built core artifact for compatibility-safe adoption.
- PR 2b in progress: added package-local source entrypoint at
  `packages/tf-core/src/index.ts` as a forwarder to root core exports.
- PR 2c in progress: initial package-local module files added (`ir`, `dsl`,
  `compiler`, `executor`, `pmi`, and utility facades) and wired through the
  local package index.

PR 3: extract DSL package.
- Move DSL helpers/types to `packages/tf-dsl`.
- Enforce no backend imports via guardrails.

PR 4: extract backend implementations.
- Move OCCT.js/native transports into backend packages.
- Keep subpath compatibility exports from `trueform`.

PR 5: extract export tooling package.
- Move STEP/GLB/3MF/SVG/DXF exporters to `packages/tf-export`.
- Keep `trueform/export` compatibility mapping.

PR 6: tighten compatibility policy.
- Add deprecation warnings/docs for direct aggregate imports where needed.
- Add migration notes and import map examples.

PR 7 (major release gate): optional facade slimming.
- Keep compatibility facade or reduce it based on adoption metrics.
- Any breaking import removals only in a major release.

## Progress

- [x] Phase 0 guardrails and explicit subpaths.
- [x] Phase 1 PR 1 scaffolding (workspace config + placeholder package manifests).
- [ ] Phase 1 PR 2 core module extraction (bridge landed; source move in progress).
