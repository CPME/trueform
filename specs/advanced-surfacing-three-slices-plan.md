# Advanced Surfacing Three-Slice Plan

Updated: 2026-03-13
Owner: geometry/core
Status: active technical design

Purpose: define a concrete implementation path for the highest-value surfacing
gaps vs leading CAD systems, while preserving TrueForm determinism and webapp-safe
runtime behavior.

Related:
- `specs/geometric-parity-plan.md` (overall parity tracker)
- `specs/geometric-benchmark-corpus.json` (scoring source of truth)
- `specs/feature-staging.md` (staging registry policy)

## Ownership

This doc owns the technical design and slice boundaries for advanced surfacing.

The live milestone state stays in `specs/geometric-parity-plan.md`:

- M11 owns overall advanced-surfacing parity status
- this file owns slice-specific technical design and acceptance detail

## Outstanding Work Snapshot

1. Finish Slice 2 (`boundary` and `fill`) implementation and validation.
2. Finish Slice 3 (guide-curve and curve-on-surface infrastructure).
3. Promote Slice 1 (`trim`, `extend`, `knit`) from staging only after the
   parity promotion gates clear.

## Scope

This plan targets three surfacing slices that unlock most missing workflows:

1. Trim/extend/knit topology workflows.
2. Boundary/fill surface creation with continuity controls.
3. Guide-curve and curve-on-surface infrastructure for controlled surfacing.

Out of scope for this plan:
- Drawing UX, rendering diagnostics UX (zebra/curvature heatmaps), and CAM.
- Full Class-A surfacing toolchain in one pass.

## Guardrails (Must Hold)

1. Do not expose B-Rep handles to clients.
2. Keep feature execution deterministic for equivalent normalized IR.
3. Keep selector behavior backend-agnostic and explicit on ambiguity.
4. Ship each slice behind staging until conformance + failure + determinism
   tests pass.
5. Keep meshing async and profile-driven (`interactive` vs `export`).

## Slice 1: Surface Topology Foundation (Trim, Extend, Knit)

### User Value

- "Trim this face by these tools."
- "Extend this surface edge by a distance."
- "Knit these patches into one shell/solid candidate."

### Proposed IR Additions

- `feature.trim.surface`
  - `source: Selector`
  - `tools: Selector[]`
  - `keep: "inside" | "outside" | "both"`
  - `result: string`
- `feature.extend.surface`
  - `source: Selector`
  - `edges: Selector`
  - `distance: Scalar`
  - `mode?: "natural" | "tangent"`
  - `result: string`
- `feature.knit`
  - `sources: Selector[]`
  - `tolerance?: Scalar`
  - `makeSolid?: boolean`
  - `result: string`

### DSL Additions

- `trimSurface(id, source, tools, result?, deps?, opts?)`
- `extendSurface(id, source, edges, distance, result?, deps?, opts?)`
- `knit(id, sources, result?, deps?, opts?)`

### Backend Implementation Notes (OCCT)

- `trim.surface`: prefer split/trim primitives where available; fallback to
  split + keep-side selection when direct trim op is unavailable in OCJS.
- `extend.surface`: use OCCT surface extension ops for supported face classes
  (planar/cylindrical/conical first), fail explicitly for unsupported classes.
- `knit`: sew surfaces with tolerance, then optionally attempt solidification.
  Return explicit non-solid result when `makeSolid` cannot be satisfied.

### Tests

- `src/tests/occt.trim_surface.e2e.test.ts`
- `src/tests/occt.extend_surface.e2e.test.ts`
- `src/tests/occt.knit.e2e.test.ts`
- Determinism probes for all three (`*.e2e.probe.ts`).
- Failure-mode coverage:
  - non-intersecting trim tools
  - ambiguous keep-side selection
  - unsupported surface extension class
  - non-watertight knit with `makeSolid: true`

### Exit Gate

- Promote to `ready` only when repeated runs produce stable selector metadata
  and failure contracts are explicit/non-ambiguous.

## Slice 2: Boundary + Fill Surface with Continuity

### User Value

- "Create a surface between boundary curves."
- "Patch a hole in a surface network."
- "Control tangent continuity to neighbors."

### Proposed IR Additions

- `feature.surface.boundary`
  - `boundaries: Selector[] | Path3D[]`
  - `guides?: Selector[] | Path3D[]`
  - `continuity?: { boundary?: "g0" | "g1"; guides?: "g0" | "g1" }`
  - `result: string`
- `feature.surface.fill`
  - `boundary: Selector[] | Path3D[]`
  - `continuityRefs?: Array<{ target: Selector; continuity: "g0" | "g1" }>`
  - `result: string`

Initial continuity scope:
- `g0` and `g1` only.
- `g2` deferred until deterministic behavior is proven.

### DSL Additions

- `surfaceBoundary(id, boundaries, result?, deps?, opts?)`
- `surfaceFill(id, boundary, result?, deps?, opts?)`

### Backend Implementation Notes (OCCT)

- Start with robust subset:
  - open/closed boundary loops with explicit ordering.
  - bounded guide-curve count and strict input validation.
- Use explicit validation errors for under-constrained or non-manifold inputs.
- Keep solver knobs fixed in v1 to avoid non-deterministic behavior from
  unconstrained parameter tuning.

### Tests

- `src/tests/occt.surface_boundary.e2e.test.ts`
- `src/tests/occt.surface_fill.e2e.test.ts`
- Failure modes:
  - open boundary not closing where required
  - self-intersecting boundary input
  - unsupported continuity request
  - guide curve not intersecting boundary domain

### Exit Gate

- Promote to `ready` only after shape validity + deterministic rebuild coverage
  across at least three topology classes (planar patch, mixed-curvature patch,
  multi-boundary patch).

## Slice 3: Guide Curves + Curve-on-Surface Infrastructure

### User Value

- "Project this sketch curve onto a face."
- "Use guide curves to control loft/sweep shape."
- "Build surface workflows from intersection/projected curves."

### Proposed IR Additions

- `feature.curve.project`
  - `curve: Selector | Path3D`
  - `target: Selector`
  - `direction?: AxisSpec`
  - `result: string`
- `feature.curve.intersect`
  - `a: Selector`
  - `b: Selector`
  - `result: string`
- Expand existing:
  - `feature.loft.guides?: Selector[] | Path3D[]`
  - `feature.sweep.guide?: Selector | Path3D`

### DSL Additions

- `projectCurve(id, curve, target, result?, deps?, opts?)`
- `intersectCurve(id, a, b, result?, deps?)`
- Extend `loft(...)` and `sweep(...)` options with guide refs.

### Backend Implementation Notes (OCCT)

- Keep curves as backend-owned geometry artifacts; expose only selector/named
  outputs in IR contract.
- Resolve guide usage deterministically:
  - explicit ordering required
  - ambiguity is an error
- If OCJS support diverges, gate unsupported variants with
  `backend_unsupported_feature` and document fallback paths.

### Tests

- `src/tests/occt.curve_project.e2e.test.ts`
- `src/tests/occt.curve_intersect.e2e.test.ts`
- `src/tests/occt.loft_guides.e2e.test.ts`
- `src/tests/occt.sweep_guide.e2e.test.ts`
- Failure modes:
  - projection misses target
  - guide set under-constrained
  - guide ordering ambiguity

### Exit Gate

- Promote to `ready` only when guide-driven loft/sweep output remains
  deterministic under repeated builds and selector re-resolution.

## Delivery Order and Dependencies

1. Slice 1 first (topology foundation needed by later patch workflows).
2. Slice 3 second (guide/curve infra reused by boundary/fill workflows).
3. Slice 2 third (boundary/fill built on top of topology + curve infra).

Rationale:
- This sequence reduces backend risk and avoids shipping high-level surfacing
  without stable low-level trim/knit behavior.

## Parity/Corpus Updates Required

When each slice lands:

1. Split current corpus entry `advanced-surfacing-boundary-fill-knit` into
   granular entries:
   - `advanced-surfacing-trim-extend-knit`
   - `advanced-surfacing-boundary-fill`
   - `advanced-surfacing-guides-curve-on-surface`
2. Keep matrix status aligned in `specs/geometric-parity-matrix.md`.
3. Update staging registry entries in `src/feature_staging.ts`.
4. Run:

```bash
npm run parity:geometric:report
```

## PR Checklist (Per Slice)

- [ ] IR + schema + normalization support landed.
- [ ] DSL helper surface landed and documented.
- [ ] Validation invariants and clear error contracts landed.
- [ ] OCCT backend implementation + capability gating landed.
- [ ] Positive e2e + failure-mode + determinism probes landed.
- [ ] Staging registry + parity corpus + matrix status synchronized.
