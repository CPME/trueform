# Semantic Topology Runtime Fixtures

These are the canonical runtime fixtures for validating the
`beta-2026-03-02` semantic-topology contract through the actual `/v1/build`
boundary.

## Fixture A: Boolean Union Face And Edge Parity

Purpose:
- Prove that build-result selection ids and mesh selection ids use the same
  canonical semantic tokens.
- Prove that mesh selections are a subset of build-result selections.

Model:
- Extrude a 20 x 20 x 10 base body as `body:left`.
- Extrude an 8 x 8 x 6 tool body as `body:tool-seed`.
- Move the tool by `[0, 0, 10]` into `body:right`.
- Run `feature.boolean` with `op: "union"` into `body:main`.

Expected canonical ids:
- Face: `face:body.main~union-1.right.side.1`
- Edge: `edge:body.main~union-1.right.side.1.bound.top`

Required assertions:
- `result.selections.faces` contains `face:body.main~union-1.right.side.1`.
- `result.selections.edges` contains
  `edge:body.main~union-1.right.side.1.bound.top`.
- `result.mesh.asset.selections` contains both ids above.
- Every face id in `result.mesh.asset.selections` is also present in
  `result.selections.faces`.
- Every edge id in `result.mesh.asset.selections` is also present in
  `result.selections.edges`.

Reference implementation:
- [src/tests/runtime_service.e2e.test.ts](/home/eveber/code/trueform/src/tests/runtime_service.e2e.test.ts)
  test: `runtime service: semantic topology ids match between build results and mesh payloads`

## Fixture B: Stable Face Id Reuse Across Rebuild

Purpose:
- Prove that a stored direct-pick semantic face id can be reused after an
  upstream geometry change.

Model:
- Seed build: extrude a rectangular base as `body:main`.
- Capture the emitted top-face id from mesh selections.
- Rebuild with an upstream change and reuse that same id in a downstream
  selector-driven feature.

Expected invariant:
- The stored top-face id still resolves after the rebuild.
- The emitted face-center point anchor remains derived from the same canonical
  face id.

Reference implementation:
- [src/tests/runtime_service.e2e.test.ts](/home/eveber/code/trueform/src/tests/runtime_service.e2e.test.ts)
  test: `runtime service: stable selection ids round-trip across builds`
