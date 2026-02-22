# Feature Staging Registry

Updated: 2026-02-22

Purpose: keep in-development modeling features explicit and machine-readable so
clients and agents can avoid treating them as production-stable.

## Source of Truth

- Runtime/SDK registry: `src/feature_staging.ts`
- Runtime exposure: `GET /v1/capabilities` -> `featureStages`

## Current Staging Entries

- `feature.draft`
  - Status: `staging`
  - Note: draft behavior is available but still hardening across broader face-selection cases.
- `feature.thread`
  - Status: `staging`
  - Note: modelled thread geometry is under active tuning.
- `feature.move.body`
  - Status: `staging`
  - Note: move/copy/scale body supports core transforms while edge-case reliability hardening continues.
- `feature.fillet.variable`
  - Status: `staging`
  - Note: variable fillet supports core per-edge radii workflows while broader corner behavior hardening continues.
- `feature.chamfer.variable`
  - Status: `staging`
  - Note: variable chamfer supports core per-edge distance workflows while broader corner behavior hardening continues.
- `feature.delete.face`
  - Status: `staging`
  - Note: delete face supports core workflows while replace/heal edge-case reliability hardening continues.
- `feature.replace.face`
  - Status: `staging`
  - Note: replace face supports core workflows while broader surface-matching reliability hardening continues.
- `feature.move.face`
  - Status: `staging`
  - Note: move face supports core workflows while broader healing/topology reliability hardening continues.
- `feature.surface`
  - Status: `staging`
  - Note: surface workflows are functional but still improving in reliability.
- `feature.extrude:mode.surface`
  - Status: `staging`
- `feature.revolve:mode.surface`
  - Status: `staging`
- `feature.loft:mode.surface`
  - Status: `staging`
- `feature.sweep:mode.surface`
  - Status: `staging`
- `feature.pipeSweep:mode.surface`
  - Status: `staging`
- `feature.hexTubeSweep:mode.surface`
  - Status: `staging`

## Update Rule

When a feature is not reliable enough for default production use:

1. Add or update the entry in `src/feature_staging.ts`.
2. Keep a short note explaining the limitation.
3. Ensure `/v1/capabilities` still surfaces the entry under `featureStages`.
4. Add/adjust a focused test in `src/tests/` for the staging signal.

## Enforcement Modes

`ValidationOptions.stagedFeatures` controls behavior when staged features are
present during normalize/compile/build:

- `"allow"`: no warnings, do not block.
- `"warn"`: emit warnings, do not block.
- `"error"`: fail with `validation_staged_feature`.

Example:

```ts
buildPart(part, backend, undefined, { stagedFeatures: "error" });
```

Runtime API (`POST /v1/build`) mirrors this under `options.stagedFeatures`.
