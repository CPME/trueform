# Step 1: V1 Contract Lock (Draft)

Date: 2026-02-11
Status: Completed

## Goal

Lock the v1 product contract so compile/runtime/docs all describe the same
behavior before further feature expansion.

## Working Decisions

1. Assembly storage model:
   - Part files/documents store part geometry intent and part-level mate
     connectors.
   - Assembly intent lives in a separate assembly file/document.
2. Compile scope:
   - Deterministic core compile is part-centric in v1.
   - Assembly solving is not part of core compile semantics.
3. Public API tiers:
   - Root package should be stable authoring + compile + IR contracts.
   - Backend/kernel-facing APIs should move to explicit backend/spi exports.
   - Unstable surfaces should move under explicit `experimental` exports.

## Initial Data Model Direction

Part document/file:
- Part IR.
- Part-level connectors (`connector(id, origin, opts?)` intent).
- Optional part-local constraints/assertions/tolerancing intent.

Assembly document/file:
- Instances referencing part ids or part document refs.
- Mates between `AssemblyRef = { instance, connector }`.
- Assembly outputs and assembly-level constraints/assertions (if enabled).

## Checklist

### Completed in this pass
- [x] README wording updated to backend-interchangeable framing.
- [x] README architecture diagram split into compile vs execute/export stages.
- [x] README status updated with part-centric compile and assembly-file direction.
- [x] Architecture remediation plan documented in `aidocs/architecture.md`.

### Remaining for Step 1
- [x] Publish a stable contract doc in `specs/` (source-of-truth, not aidocs).
- [x] Update DSL docs to remove data-only vs solver contradiction.
- [x] Add explicit assembly file/document format section to reference docs.
- [x] Define import/reference shape from assembly docs to part docs.
- [x] Decide transition strategy for existing single-document bundle flows.
- [x] Define temporary compatibility layer and deprecation timeline.

## Next Focus

- Define package split execution details (naming + phased migration PR breakdown).
