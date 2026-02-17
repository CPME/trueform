# Tolerancing DSL

## Tolerancing

- `refSurface(selector) -> RefSurface`
- `refFrame(selector) -> RefFrame`
- `refEdge(selector) -> RefEdge`
- `refAxis(selector) -> RefAxis`
- `refPoint(selector) -> RefPoint`
- `datumFeature(id, label, target, opts?) -> FTIDatum`
- `datumRef(datumId, modifiers?) -> DatumRef`
- `surfaceProfileConstraint(id, target, tolerance, opts?) -> SurfaceProfileConstraint`
- `flatnessConstraint(id, target, tolerance, opts?) -> FlatnessConstraint`
- `parallelismConstraint(id, target, tolerance, datumRefs, opts?) -> ParallelismConstraint`
- `perpendicularityConstraint(id, target, tolerance, datumRefs, opts?) -> PerpendicularityConstraint`
- `positionConstraint(id, target, tolerance, datumRefs, opts?) -> PositionConstraint`
- `sizeConstraint(id, target, opts) -> SizeConstraint`
- `dimensionDistance(id, from, to, opts?) -> DimensionDistance`
- `dimensionAngle(id, from, to, opts?) -> DimensionAngle`
- `cosmeticThread(id, target, opts?) -> CosmeticThread`

Notes:
- Cosmetic threads are preferred for most cases; they propagate to PMI and STEP AP242.
- For `dimensionDistance` and `dimensionAngle`, include `nominal` whenever
  `tolerance` or `plus`/`minus` are provided.
- Use `evaluatePartDimensions(part, kernelResult, opts?)` to evaluate semantic
  dimensions from resolved kernel metadata (`center`, `normalVec`/`normal`).

Examples:
- [Cosmetic thread](./examples/tolerancing#cosmetic-thread)
- [Tolerancing (PMI sidecar)](./examples/tolerancing#tolerancing-pmi-sidecar)
