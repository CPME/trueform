# Unwrap Progress Tracker (2026-02-24)

Status: active tracker
Updated: 2026-03-13
Owner: geometry/core

Purpose: capture the current unwrap implementation state and the remaining
quality work before public examples are re-enabled.

## Current State

Latest notable unwrap commits:

- `c2d3364` full solid-cylinder net (side plus caps)
- `932b0ac` deterministic seam ordering, stitch fallback, and determinism test

Public docs exposure remains gated:

- `unwrap-solid` and `unwrap-shell` examples are still removed from docs and
  gallery output until quality sign-off
- public assets remain deleted:
  - `docs/public/examples/dsl/unwrap-solid.iso.png`
  - `docs/public/examples/dsl/unwrap-shell.iso.png`

## Supported Behavior

Supported source selections:

- `face`
- `surface` (single or multi-face)
- `solid` (thin-sheet, planar-polyhedral, and box-net paths)

Supported source geometry classes:

- planar faces
- cylindrical faces
- thin solids via paired planar/cylindrical face extraction
- axis-aligned rectangular solids via deterministic net layout
- full solid cylinders via rectangle plus two cap faces
- planar polyhedral solids via fallback connected layout

Output:

- face or compound-face result on the XY plane
- metadata under `meta.unwrap`

## Outstanding Work

1. Seam stitching after connected-face placement.
- Prefer deterministic ordering and stable tolerances for unfoldable face sets.

2. Seam continuity assertions.
- Add targeted e2e assertions that go beyond coincident vertices.

3. Private visual review workflow.
- Add a non-public render workflow or script for before/after snapshots.

4. Public example re-enable gate.
- Re-enable `unwrap-solid` and `unwrap-shell` only after visual and geometry
  quality sign-off.

## Known Quality Gaps

1. Multi-face unwrap for complex swept surfaces can still produce awkward
   overlaps.
2. Complex enclosed boxy solids can still produce heavily overlapping layouts.
3. Box/cube representative nets are deterministic only for axis-aligned
   rectangular solids; arbitrarily oriented boxes still use the planar-polyhedral
   fallback.
4. Checked-in before/after review examples do not exist yet; current snapshots
   are generated privately under `/tmp/unwrap-review`.

## Validation Commands

```bash
cd /home/eveber/code/trueform
npm run build -- --pretty false
node dist/tests/occt.unwrap.e2e.test.js
```

Expected: all 9 unwrap tests pass.
