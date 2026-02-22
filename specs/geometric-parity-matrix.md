# Geometric Feature Parity Matrix (Onshape/SolidWorks Baseline)

Updated: 2026-02-22

Purpose: track TrueForm progress toward near feature parity for geometric part
modeling workflows commonly used in Onshape/SolidWorks.

Status keys:
- `ready`: available and expected for production use.
- `staging`: available but not yet production-stable.
- `missing`: not yet implemented in TrueForm.

## Scope

- Included: part-level geometric modeling features.
- Excluded: drawings, CAM, simulation, PDM/PLM, rendering, assembly solving UX.

## Matrix

| Category | Representative CAD operations | TrueForm status | Notes |
| --- | --- | --- | --- |
| Sketch + datums | 2D sketch primitives, datum planes/axes/frames | `ready` | Core available in DSL/IR. |
| Base solids | Extrude/revolve/loft/sweep/pipe, primitive profile workflows | `ready` | Surface mode separately tracked as staging. |
| Surface creation | Surface feature + surface-mode extrude/revolve/loft/sweep | `staging` | Tracked in staging registry. |
| Hole workflows | Simple, through/blind, counterbore/countersink, patterned holes | `ready` | Advanced wizard semantics still partial. |
| Dress-up | Fillet/chamfer/shell/thicken | `ready` | Core workflows are ready; variable fillet/chamfer controls are now available in staging. |
| Draft + thread | Draft faces, modeled thread geometry | `staging` | Explicitly marked staging. |
| Booleans | Union/subtract/intersect | `ready` | Available in DSL as canonical boolean op. |
| Patterns + transforms | Linear/circular patterns, mirror | `ready` | Curve/fill/table-driven patterns missing. |
| Multi-body direct edits | Split body, split face | `ready` | Selector/failure-mode and stability probes are now in place. |
| Multi-body direct edits | Delete/replace/move face, move/copy body | `staging` | `feature.move.body`, `feature.move.face`, `feature.delete.face`, and `feature.replace.face` are now available in staging. |
| Advanced surfacing | Boundary/fill/trim/untrim/extend/knit/heal | `missing` | High-value surfacing backlog. |
| Advanced profile ops | Rib/web, wrap/emboss/deform/flex | `missing` | Common in production CAD workflows. |
| Advanced hole/edge options | Hole wizard standards, variable fillets/chamfers | `staging` | Variable fillet/chamfer landed in staging; full hole-wizard standards/end-conditions remain missing. |

## Near-Parity Exit Gates

1. Coverage gate: weighted feature coverage score >= `0.85`.
2. Reliability gate: benchmark probe pass rate >= `0.99`.
3. Stability gate: staged geometric features reduced to edge-case-only items.

## Measurement Inputs

- Machine-readable corpus: `specs/geometric-benchmark-corpus.json`
- CI score report: `tools/ci/geometric-parity-report.mjs`
- Execution tracker: `specs/geometric-parity-plan.md`
