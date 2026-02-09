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
- DSL and IR are the same thing. Internal IR re-exports the DSL.
- Compilation normalizes and builds a deterministic order.
- Execution is a sequential backend loop that resolves selectors at runtime.
- OCCT is the only real backend. Native transport exists but is OCCT.
- Assemblies are declared "data-only" in the DSL but there is a solver.
- Assertions and constraints exist as data but are not enforced.

This is a reasonable v1 modeling layer, but it does not yet fulfill the
"standards + IR + kernel + API" framing.

## Findings (Issues To Fix)

Severity: High
- No distinct, versioned IR. The DSL is the IR, which blocks interchange
  and stable tooling across versions.
- Kernel independence is unproven. OCCT is the only backend; no conformance
  test suite exists to validate other kernels.
- Assertions and constraints are explicitly not evaluated. This undermines
  the "intent" promise.

Severity: Medium
- Assembly is described as data-only, but a solver exists without a clear
  contract for kernel integration. This is a semantic mismatch.
- Build pipeline lacks explicit incremental caching and build context
  semantics beyond feature hashing.
- Mesh and export APIs do not enforce webapp footgun boundaries. It is
  possible to leak kernel objects or block on long operations.

Severity: Low
- Internal API surface is mixed: some modules are "public-ish" without a
  clear packaging boundary.
- The viewer/export tooling is useful but is not a formal API layer.

## Should There Be An IR?

Yes. A distinct, versioned IR is required if the project intends to be:
- An interchange format across tools.
- Kernel-agnostic.
- Stable for agents, CI, and long-lived projects.

Without a separate IR, changes to the DSL will be breaking by default,
and external tools cannot rely on a stable schema.

## Clear Separation Plan (DSL vs IR)

Goal:
Keep the DSL as a friendly authoring layer and define a strict IR that is
stable, versioned, and validated. The compiler becomes a DSL-to-IR
translator. Backends consume only IR.

Proposed separation:
1. Create an IR schema package or module with no DSL builders.
   - Types only, JSON-serializable.
   - Add a version field at the document and part levels.
2. Move normalization and validation to operate on IR only.
3. Make the DSL compiler emit IR and nothing else.
4. Update executor to take IR as input, not DSL.
5. Treat the DSL as optional. External tools can generate IR directly.

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

Immediate (1-2 weeks):
1. Draft IR v1 schema (types + JSON shape). Add versioning.
2. Implement a DSL-to-IR compiler. Keep DSL unchanged.
3. Update executor to consume IR only.
4. Add a conformance test harness stub for backends.

Near-term (3-6 weeks):
1. Implement IR validation and normalization as a separate module.
2. Define backend capability negotiation and explicit error surfaces.
3. Add a minimal assertion evaluator (brepValid, minEdgeLength).
4. Define build context + caching keys (feature hash + inputs).

Mid-term (6-10 weeks):
1. Decide assembly scope. Either:
   - Move solver into a distinct "assembly" package and integrate via a
     defined interface, or
   - Keep assemblies data-only in core and move solving out of scope.
2. Build kernel-agnostic selector conformance tests.
3. Introduce a mesh pipeline abstraction (interactive vs export profiles).

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

## Implementation Status (2026-02-09)

Completed:
- IR schema and version fields added to `IntentDocument` with validation.
- Explicit DSL to IR conversion introduced (`emitIrDocument`, `emitIrPart`).
- IR JSON Schema added and exported (`src/ir_schema.ts`).
