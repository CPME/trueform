# Unwrap Progress Tracker (2026-02-24)

Purpose: capture current unwrap implementation status and the next execution
steps so work can resume cleanly in the next session.

## Latest State

- Branch: `main`
- Last unwrap-focused commit: `d7a66fa`
- Public docs exposure status:
  - `unwrap-solid` and `unwrap-shell` examples are removed from docs examples
    and gallery output until quality sign-off.
  - Public assets deleted:
    - `docs/public/examples/dsl/unwrap-solid.iso.png`
    - `docs/public/examples/dsl/unwrap-shell.iso.png`

## Completed Milestones

1. Planar face unwrap: `12bc68f`
2. Cylindrical face unwrap: `b1dea7f`
3. Unwrap metrics metadata: `95824a9`
4. Multi-face developable input support: `e1aadaf`
5. Thin-solid sheet extraction wrapper: `45152d4`
6. Connected-face alignment + docs gating: `3bf56e1`
7. Cube-style solid unwrap net fallback: `d7a66fa`

## Current Behavior

- Supported unwrap source selections:
  - `face`
  - `surface` (single or multi-face)
  - `solid` (thin-sheet, planar-polyhedral, and box-net paths)
- Supported source geometry classes:
  - Planar faces
  - Cylindrical faces
  - Thin solids via paired planar/cylindrical face extraction
  - Axis-aligned rectangular solids (cube/cuboid) via deterministic net layout
  - Planar polyhedral solids (fallback connected layout)
- Unwrap output:
  - Face or compound face output on XY plane
  - Metadata under `meta.unwrap`

## Known Gaps

1. Multi-face unwrap can still produce visually confusing layouts for some
   swept surfaces; geometry is aligned by adjacency, but not seam-stitched
   into a single topologically merged sheet where possible.
2. Full solid cylinder unfolding with cap handling is not implemented.
   Current cylinder unwrap behavior is lateral face/surface flattening.
3. Box/cube representative net is deterministic only for axis-aligned
   rectangular solids; arbitrarily oriented boxes currently use generic
   planar-polyhedral fallback.
4. No dedicated “before vs after unwrap” checked-in examples yet; current
   review snapshots are generated privately under `/tmp/unwrap-review`.

## Resume Checklist

1. Add seam-stitching pass after connected-face placement for unfoldable
   face sets (prefer deterministic ordering and stable tolerances).
2. Add targeted e2e assertions for seam continuity (beyond coincident vertices).
3. Add non-public review render workflow/script for before/after snapshots.
4. Re-enable public unwrap-solid and unwrap-shell docs examples only after
   acceptance of visual/geometry quality.

## Execution Plan (2026-02-25)

1. Solid cylinder complete net
   - Implement solid-cylinder unwrap path that emits:
     - one lateral rectangle (`2*pi*r` by `height`)
     - two circular cap faces
   - Layout target:
     - rectangle centered at origin, one cap above, one cap below
   - Metadata:
     - `solidExtraction.method = "solidCylinderNet"`
     - include `radius`, `height`, `capCount`.
   - Acceptance:
     - unwrap e2e verifies `>=3` faces, area conservation, and metadata.

2. Deterministic seam-cut policy for planar polyhedra
   - Replace traversal-order dependence with stable face ordering + stable
     adjacency edge ordering.
   - Prefer non-overlapping placement and consistent cut choices.
   - Acceptance:
     - cube and representative planar-poly tests give repeatable layouts across runs.

3. Post-layout merge/stitch attempt
   - Add optional merge attempt for connected coplanar seams after placement.
   - Keep fallback to existing compound output if merge fails.
   - Acceptance:
     - no regressions in existing unwrap tests.
     - add targeted assertions where merged topology is expected.

4. Visual and docs gating workflow
   - Keep new unwrap examples private until manual sign-off.
   - Regenerate `/tmp/unwrap-review` images for each milestone.
   - Acceptance:
     - explicit before/after image set for shell, cylinder, and cube.

## Validation Commands

```bash
cd /home/eveber/code/trueform
npm run build -- --pretty false
node dist/tests/occt.unwrap.e2e.test.js
```

Expected: all 7 unwrap tests pass.
