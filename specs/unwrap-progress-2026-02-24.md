# Unwrap Progress Tracker (2026-02-24)

Purpose: capture current unwrap implementation status and the next execution
steps so work can resume cleanly in the next session.

## Latest State

- Branch: `main`
- Last unwrap-focused commit: `3bf56e1`
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

## Current Behavior

- Supported unwrap source selections:
  - `face`
  - `surface` (single or multi-face)
  - `solid` (thin-sheet detection path)
- Supported source geometry classes:
  - Planar faces
  - Cylindrical faces
  - Thin solids via paired planar/cylindrical face extraction
- Unwrap output:
  - Face or compound face output on XY plane
  - Metadata under `meta.unwrap`

## Known Gaps

1. Multi-face unwrap can still produce visually confusing layouts for some
   swept surfaces; geometry is aligned by adjacency, but not yet seam-stitched
   into a single topologically merged sheet where possible.
2. Full solid cylinder unfolding with cap handling is not implemented.
   Current cylinder unwrap behavior is lateral face/surface flattening.
3. No dedicated “before vs after unwrap” checked-in examples yet; current
   review snapshots were generated privately.

## Resume Checklist

1. Add seam-stitching pass after connected-face placement for unfoldable
   face sets (prefer deterministic ordering and stable tolerances).
2. Add targeted e2e assertions for seam continuity (beyond coincident vertices).
3. Add non-public review render workflow/script for before/after snapshots.
4. Re-enable public unwrap-solid and unwrap-shell docs examples only after
   acceptance of visual/geometry quality.

## Validation Commands

```bash
cd /home/eveber/code/trueform
npm run build -- --pretty false
node dist/tests/occt.unwrap.e2e.test.js
```

Expected: all 6 unwrap tests pass.
