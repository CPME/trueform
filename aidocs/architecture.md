# Architecture Review (Draft)

Date: 2026-02-09
Reviewer: Codex

This document captures architectural findings for the current TrueForm repo
and proposes a concrete path forward. It is intentionally direct and focuses
on issues that will block the stated mission if left unaddressed.

## Scope

The review is based on the current repository structure and core modules:
the DSL, compiler, executor, selectors, backend interfaces, and OCCT
implementations. The viewer and docs are considered only as they affect
core architecture and webapp viability.

## Current Architecture (Observed)

Summary:
- DSL emits a separate IR with schema + versioning; IR has a JSON schema.
- Compilation normalizes and builds a deterministic order.
- Execution is a sequential backend loop that resolves selectors at runtime.
- OCCT is the only real backend. Native transport exists but is OCCT.
- Assemblies are data-only in IR; solver is a separate utility module.
- Assertions and constraints exist as data but are not enforced.

This is a reasonable v1 modeling layer, but it does not yet fulfill the
"standards + IR + kernel + API" framing.

## Findings (Issues To Fix)

Severity: High
- Kernel independence is unproven. OCCT is the only backend; conformance
  coverage is minimal and mock-only today.
- Assertions and constraints are not evaluated by default (an evaluator
  exists, but is not wired into build).

Severity: Medium
- Build pipeline lacks integrated caching (cache keys exist but are not
  used in build/mesh/extract flows).
- Mesh and export APIs do not enforce webapp footgun boundaries. It is
  possible to leak kernel objects or block on long operations.

Severity: Low
- Internal API surface is mixed: some modules are "public-ish" without a
  clear packaging boundary.
- The viewer/export tooling is useful but is not a formal API layer.

## IR Status

The IR now exists and is required if the project intends to be:
- An interchange format across tools.
- Kernel-agnostic.
- Stable for agents, CI, and long-lived projects.

The remaining gap is enforcing IR-only boundaries and defining
migration/versioning strategy.

## Clear Separation Plan (DSL vs IR)

Goal:
Keep the DSL as a friendly authoring layer and define a strict IR that is
stable, versioned, and validated. The compiler becomes a DSL-to-IR
translator. Backends consume only IR.

Proposed separation (remaining):
1. Move normalization and validation to operate on IR only.
2. Treat the DSL as optional. External tools can generate IR directly.

This keeps authoring flexible while stabilizing the interchange contract.

## Investigation List

These items need focused investigation or decisions before implementation:
- IR schema scope. What is the minimal IR for v1 that remains stable?
- Versioning strategy. How to migrate IR documents across versions?
- Selector semantics. Must be fully deterministic and kernel-agnostic.
- Build context and caching. What is the canonical key for feature reuse?
- Assembly contract. Is the solver in-scope for v1 or should it be moved
  to a separate layer with a clear interface?
- FTI and assertion evaluation. What is the minimal runtime evaluator that
  can run in Node and in the browser (worker)?
- Backend capability flags. How do we fail fast on unsupported features?

## Path Forward (Concrete Steps)

Mid-term (6-10 weeks):
1. Wire mesh profiles into viewer/export and enforce profile usage.

## Non-Goals (For Now)

- Full GUI CAD application.
- Multi-kernel parity across all features.
- A universal file format replacement for STEP/IGES in v1.

## Risks If Unaddressed

- Tooling lock-in: without a stable IR, external tools cannot integrate
  safely, and version drift will be constant.
- Kernel coupling: the system becomes "OCCT with a DSL" rather than a
  reusable architecture.
- Inconsistent semantics: selector and assembly behavior may diverge
  across backends without formal tests.

## Notes

This is a pragmatic, staged path that preserves current momentum while
creating a real interchange layer and clearer boundaries.
