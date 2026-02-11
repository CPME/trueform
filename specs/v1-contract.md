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
3. Backend contract:
   - Backends execute normalized feature intent.
   - Backend internals stay out of stable authoring contracts.

## Assembly Contract (v1 direction)

1. Connectors:
   - Mate connectors are authored and stored at the part level.
2. Storage:
   - Assembly intent is stored in a separate assembly file/document.
3. Solver scope:
   - Assembly solving helpers can exist as experimental utilities.
   - Assembly solving is not a required stage of core deterministic part compile.

## API Stability Tiers

Stable:
- IR types and schema identifiers.
- DSL authoring helpers for core features.
- Core compile/build contracts for parts.

Experimental:
- Assembly solver helpers.
- Native transport variants and any backend-specific extension hooks.

Backend SPI:
- Kernel-facing/backend-facing contracts used to implement backends.
- Must be exposed through explicit backend/spi entry points, not root API.

## Documentation Alignment Requirements

The following docs must remain consistent with this contract:
- `README.md`
- `docs/reference/dsl/assembly.md`
- `docs/reference/file-format.md`
- `specs/summary.md`
- `specs/docs-map.md`

## Open Items

- Exact assembly file schema and part reference format.
- Compatibility path for existing mixed document flows.
- Final root export policy for stable vs experimental/backend symbols.
