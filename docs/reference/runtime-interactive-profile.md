# Interactive Runtime Profile

Use this profile when a UI is iterating quickly (selection HUD, camera motion, frequent rebuilds).

## Startup

Use dist-only startup to avoid rebuilding test files on every launch:

```bash
npm run runtime:serve:dist
```

Use full rebuild startup only when source has changed and dist is stale:

```bash
npm run runtime:serve
```

## Build Requests

- Prefer `options.meshProfile: "interactive"` for immediate viewport feedback.
- Use `POST /v1/build/partial` with `partial.changedFeatureIds` once a session baseline exists.
- Keep `options.prefetchPreview` enabled unless memory pressure requires disabling it.

## Timeouts

- Client poll timeout: 30-60s for normal interactions.
- Runtime default timeout (`TF_RUNTIME_JOB_TIMEOUT_MS`): 30s.
- For heavy explicit operations (dense mesh/export), set per-request `timeoutMs`.

## Measure + Diagnostics

- Gate measurement calls with `/v1/capabilities.optionalFeatures.measure.endpoint`.
- Use `/v1/measure` for HUD metrics on selected targets.
- On failed jobs, consume `error.code` and `error.details.featureId` for feature-level messaging.
- For partial builds, inspect `result.diagnostics.partialBuild`:
  - `buildMode`
  - `reusedFeatureIds`
  - `invalidatedFeatureIds`
  - `failedFeatureId`

## Mesh Defaults

- Interactive: fast tessellation for camera motion and selection.
- Preview: medium quality for review snapshots.
- Export: highest quality for downstream exports.
- Avoid requesting export-grade meshing for every interaction.
