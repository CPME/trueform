# CAD Agent Feedback & Tooling Notes

## Feedback on Recent Part Generation

### What went wrong
- I optimized for speed over structure, which is why all parts landed in one file.
- I relied too heavily on boolean tool cuts, so many parts share the same visual language.
- I didn’t define a per-part geometry quality bar (distinct silhouettes, real mechanical features).
- I didn’t visually validate each part and iterate; the hinge knuckle shipped as a simple block.

### How the process should improve
- Start each part with a short spec: intent, key features, silhouette, constraints.
- Use more feature diversity (revolve profiles, multi-stage bores, ribs, bosses) instead of pure blocks.
- Require a minimum complexity checklist for “difficult” parts.
- Run render-review-fix loops on every part.
- Split parts into separate files and aggregate them via a registry.
- Transcribe drawings into explicit parameters before modeling.
- Build centerline/path first for pipe-like geometry, then create the hollow section.
- Add flange pads and bolt patterns after the core flow path is correct.
- Use reference overlays during iteration to align with the drawing.
- Use param sweeps to converge on dimensions instead of eyeballing.

## Tooling Improvements to Build

1. **Part Registry + Discovery**
   - Collect `IntentPart` exports from `src/examples/parts/*.ts`.
   - Keep each part in its own file, aggregate into a single registry for export + tests.

2. **Selector Debug Overlay**
   - Surface selector candidates (faces/edges/solids) with IDs + metadata in viewer.
   - Make ambiguous selectors immediately visible for tuning.

5. **Param Sweep Preview**
   - Generate multiple renders from a param grid to validate design robustness.

6. **Topology Snapshots**
   - Record face/edge/solid counts per part and compare in CI to catch regressions.

8. **Design Intent Tags**
   - Light annotations on features for semantics (e.g. `role: bearing-seat`).
   - Support this in the IR and include it in debug outputs.
