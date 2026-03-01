Manual diagnostics and one-off geometry comparison scripts live here.

These scripts are not part of the supported build, test, or release pipeline.
They are kept as engineering probes for investigating geometry behavior,
regressions, and implementation tradeoffs.

Current scripts:
- `helix_only_compare.mjs`: compares helix path variants and sweep outputs.
- `thread_from_sweep.mjs`: builds a thread-like ridge from a swept sketch profile.
- `thread_polyline_compare.mjs`: compares thread generation over polyline paths.
- `thread_uv_compare.mjs`: compares UV-curve based thread generation.

Usage notes:
- Build first: `npm run build -- --pretty false`
- Expect outputs under `temp/experiments/` or the script-specific env override.
- These scripts may rely on internal APIs and can be removed or rewritten if the
  maintained architecture changes.
