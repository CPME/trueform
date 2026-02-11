# Architecture Review And Remediation Plan

Date: 2026-02-11
Reviewer: Codex

## Snapshot

What is already strong:
- Clear intent -> canonical IR -> deterministic build framing.
- Selector + datum strategy avoids brittle face index usage.
- Backend boundary is explicitly documented.
- Container format separates authoritative IR from optional artifacts.

Core issues to fix:
- Public API is too mixed (stable surface vs backend internals vs experiments).
- Kernel-shaped types are exported at the root package boundary.
- Assembly contract is inconsistent across compile/docs/API.
- Core vs export layering is under-specified in product docs.
- Source-of-truth docs have drift and broken references.

## Counterarguments To Prior Critique

1. "API is too large for v1" is directionally correct, but the core issue is
   stability tiering, not raw symbol count.
2. PMI/AP242 layering risk is real, but there is already separation in code:
   `src/pmi.ts` and `src/export/step.ts` are outside compile.
3. Immediate package split is optional; boundary rules and export discipline
   can provide most of the value before a full monorepo/package split.

## Priority Plan

Step 1 (current): lock v1 contract and docs truth.
- Publish explicit v1 decisions for:
  - Assembly contract.
  - Public API tiers (`stable`, `experimental`, `backend-spi`).
  - Core pipeline boundary (`compile` vs `execute/export`).
- Align docs to one contract (README + docs + specs map).

Step 2: de-risk public API.
- Keep root exports focused on IR/DSL/compile/runtime-safe APIs.
- Move backend/kernel-facing contracts to explicit subpath exports.
- Move unstable features under `experimental` namespace.

Step 3: choose and enforce assembly stance.
- Recommended: data-only in core compile for v1.
- If solver remains, demote it to experimental and keep out of core compile.

Step 4: lock IR compatibility.
- Canonical serialization fixtures.
- Golden hash fixtures.
- Compatibility tests across schema/version upgrades.

Step 5: enforce boundaries in CI.
- Import rules to prevent DSL/core from importing backend/native internals.
- Docs-link and source-of-truth drift checks.

Step 6 (optional): package split after contract stabilization.
- `tf-core`, `tf-dsl`, `tf-backend-*`, `tf-export`, `apps/*`.

## Step 1 Decision Baseline (Started)

Assumed for Step 1 and downstream docs/code:
- Mate connectors are authored and stored at the part level.
- Assembly information is stored in a separate assembly file/document.
- Core compile remains part-centric in v1; assembly solving is not part of
  deterministic part compile.

## Checklist

### Contract And Docs
- [x] Capture architecture critique + counterarguments in this document.
- [x] Define phased remediation plan with explicit decision points.
- [x] Start Step 1 contract baseline with assembly-file assumption.
- [x] Publish v1 API stability tiers in a dedicated contract doc.
- [x] Align README, DSL docs, and specs map on one assembly contract.
- [x] Remove or fix broken docs pointers (for example `specs/backend-interface.md`).
- [x] Resolve file format naming drift (`.tfp` vs `.tf` references).
- [x] Define assembly-to-part import/reference shape in docs/contract draft.

### Boundary Hardening
- [x] Separate stable root exports from backend/kernel internals.
- [x] Introduce `experimental` export surface for unstable features.
- [x] Add lint/import boundary checks for core vs backend layers.

### IR And Compatibility
- [ ] Add canonical serialization golden fixtures.
- [ ] Add stable hash compatibility fixtures.
- [ ] Add schema compatibility test coverage for container/document reads.

## Progress Update (2026-02-11)

Completed since initial draft:
- Root API surface split into explicit subpaths:
  - `trueform/backend`
  - `trueform/backend-spi`
  - `trueform/experimental`
  - `trueform/export`
- File format docs now describe separate part (`.tfp`) and assembly (`.tfa` draft) containers.
- Assembly documents now have a draft import/reference shape tied to part files.
- CI guardrails now run docs drift checks and boundary checks on push/PR.

Next item:
- Add canonical IR/hash compatibility fixtures.
