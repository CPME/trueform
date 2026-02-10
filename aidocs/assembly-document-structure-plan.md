# Assembly Document Structure Plan

## Context
We need to rethink how assemblies live in the IR and in the DSL, especially whether assemblies should live at a higher document level, and how to represent them in both IR and DSL without introducing webapp footguns or performance blockers.

## Current State (as of Feb 2026)
Assemblies are optional, data-only entries on `IntentDocument` alongside `parts` and a single `context`. The `.tfp` container is labeled a part file but still includes `assemblies` in `document.json`. The DSL exposes `document(...)` and assembly helpers (assembly, instance, ref, mates, output, connector).

## Goals
1. Allow large assemblies without forcing monolithic documents or duplicate geometry.
2. Keep selectors, connectors, and mates backend-agnostic and stable.
3. Enable async build/mesh/export and instance transforms without blocking.
4. Preserve a simple authoring path for small examples.

## Options
Option A: Keep assemblies inside the current document IR.
Option B: Split documents by kind: part documents vs assembly documents.
Option C: Hybrid bundle document for authoring plus single-kind documents for exchange.

## Recommendation
Adopt Option C with a strong bias toward Option B for production and interchange.

## Proposed IR Shape (plan only)
Introduce `document.kind` with values `part`, `assembly`, or `bundle`.

Part document fields:
- `parts`, `context`, `capabilities`, `constraints`, `assertions`.

Assembly document fields:
- `assemblies`, `imports` (or `components`), `context`, `constraints`, `assertions`.

Add a `ComponentRef` or `PartRef` that supports:
- Local part id (bundle case).
- External document reference (URI/path + optional hash/version).

Update `AssemblyInstance` to reference a `ComponentRef` instead of only a part id.

Keep `AssemblyRef = { instance, connector }` so assembly selectors scope through instance id + selector.

## Proposed DSL Shape (plan only)
Add `assemblyDocument(...)` or `documentAssembly(...)` to build an assembly-only document.

Keep `document(...)` for bundle authoring but treat it as a convenience wrapper rather than the primary exchange format.

Add `partRef(...)` / `componentRef(...)` helpers so assembly instances can target external parts cleanly.

## Validation and Perf Guardrails
- Validate unit compatibility between assembly docs and referenced part docs.
- Cache built parts by document hash and instance via transforms.
- Keep assembly meshes lightweight and reuse part meshes with per-instance transforms.
- Do not assume stable face/edge IDs; rely on selectors and connectors.

## Migration Path
1. Default documents without `kind` to `part` if only `parts`, or `bundle` if `assemblies` exist.
2. Deprecate `assemblies` on `IntentDocument` over one version in favor of assembly documents.
3. Provide conversion from bundle to part docs + assembly doc with imports.

## Open Questions
1. Reference format for external docs: URI + hash vs hash-only plus resolver.
2. Do we allow assembly-of-assemblies in v1, or restrict to parts only.
3. How should assembly-level constraints/assertions scope and reference part geometry.

## Next Steps
- Draft schema sketch for `document.kind`, `ComponentRef`, and assembly imports.
- Update file format docs to separate part and assembly containers.
- Update DSL docs and examples for assembly documents.
