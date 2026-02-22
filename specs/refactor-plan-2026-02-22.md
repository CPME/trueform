# Refactor Plan (2026-02-22)

## Scope

1. Modularize `OcctBackend` by extracting focused helpers/modules.
2. Add bounded lifecycle management for native local shape registry.
3. Reduce sync/async executor duplication.
4. Share sketch tessellation logic across DXF/SVG exporters.

## Status

- [x] 1) Modularization (phase 1): extracted reusable OCCT helpers:
  - `src/occt/dynamic_call.ts`
  - `src/occt/edge_modifiers.ts`
- [x] 2) Shape registry lifecycle:
  - Added `shapeRegistryMaxEntries` + `shapeRegistryIdleMs` options in `LocalOcctTransport`.
  - Added idle/size pruning in `ShapeRegistry`.
- [x] 3) Executor duplication:
  - Added shared `prepareBuild` and `finalizeBuildResult` helpers in `src/executor.ts`.
- [x] 4) Shared tessellation:
  - Added `src/sketch/polyline.ts`.
  - Rewired `src/sketch/dxf.ts` and `src/sketch/svg.ts` to use shared logic with per-format options.

## Validation Run

- `npm run build -- --pretty false`
- `node dist/tests/export.svg.e2e.test.js`
- `node dist/tests/export.dxf.e2e.test.js`
- `node dist/tests/executor.incremental.e2e.test.js`
- `node dist/tests/occt.fillet.e2e.test.js`
- `node dist/tests/occt.chamfer.e2e.test.js`
- `node dist/tests/occt_native_local.e2e.test.js`

All passed on 2026-02-22.

## Follow-ups

- Continue `OcctBackend` modularization beyond edge modifiers (mesh/export pipelines still in `src/backend_occt.ts`).
- Consider adding targeted tests for shape-registry pruning behavior.
