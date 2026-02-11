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
