# TrueForm Agent Guide
As you explore, use, and modify this codebase, fix problems you find, or concisely document them as instructions to prevent future agents from encountering the same problem.

## Vision
To create the open sourced CAD tools and standards that enables the world of hardware design to flourish as the world of software has, by creating:
1. DSL: A high level authoring language with rich abstractions for humans and agents.
1. IR: An interchange layer used by tools.
1. Kernel: Leverage existing CAD kernels to interact with computers and machine tools.
1. API: A broader set of tools exposed for application builders.

## General Instructions
- Commit changes as you go (only the changes you made, unless otherwise noted)

## Performance
Make sure this is practical for use in a webapp (can it compile to opencascade.js, and then wasm, without footguns). Avoid choices that block complex assemblies or responsive rotation later.

## Webapp Footguns (avoid these)

- Do not leak B-Rep objects to the browser. Keep OCCT shapes in the backend and stream meshes.
- Do not require synchronous backend calls for long operations. Plan for async build/mesh/export.
- Do not assume stable face/edge IDs. Use selectors + datums and re-resolve each rebuild.
- Do not rely on OCCT features that are missing or diverge in occt.js unless you provide a fallback or explicit error.
- Do not mesh at export quality for interactive view. Use mesh profiles and progressive refinement.
- Do not regenerate meshes or recompute booleans when inputs are unchanged. Cache per-feature and per-part by build context.
- Do not duplicate geometry for repeated parts. Use instance transforms.
- Do not block the main thread for meshing or selection resolution in the webapp. Use workers where possible.
- Do not make selector semantics backend-specific. Keep deterministic, cross-backend selector rules.

## Docs Pointers

- Viewer helper (export/run/mesh schema): `tools/viewer/README.md`
- Technical spec (IR, pipeline, backend): `specs/spec.md`
- Overview and positioning: `specs/summary.md`
- Functional tolerancing intent: `specs/functional-tolerancing-intent.md`
- Feature staging registry: `specs/feature-staging.md` and `src/feature_staging.ts`
- Documentation source-of-truth map: `specs/docs-map.md`
- Viewer dev server: `npm run viewer:serve`

## Tests

Write tests as you build features. Run the test after you build the feature to verify it works as intended.

When you are building features, only test the impacted features. Each feature gets it's own test.

Run all tests (build + e2e):

```bash
cd /home/eveber/code/trueform
npm test
```

Native HTTP transport e2e (live local server):

```bash
cd /home/eveber/code/trueform
TF_HTTP_E2E_SERVER=1 node dist/tests/occt_native_http.e2e.test.js
```

Native OCCT server PMI e2e (requires built `native/occt_server`):

```bash
cd /home/eveber/code/trueform
TF_NATIVE_SERVER=1 node dist/tests/occt_native_server_pmi.e2e.test.js
```

## Agent Guide (E2E Feature Workflow)

Use this when adding a new feature end-to-end to avoid digging:

1. Update the DSL surface
   - Types: `src/dsl.ts` (feature types + intent union).
   - Helpers: `src/dsl/geometry.ts` (builder function + options).

2. Compiler + validation
   - Normalize new scalars: `src/compiler.ts`.
   - Validate shape + invariants: `src/validate.ts`.

3. Backend execution
   - Implement OCCT behavior: `src/backend_occt.ts`.
   - Prefer primitives that exist in `opencascade.js` and reuse helpers like
     `makeCylinder`, `makeCone`, `makeBoolean`, `splitByTools`.

4. Examples + docs
   - Add/extend DSL example: `src/examples/dsl_feature_examples.ts`.
   - Update docs: relevant page under `docs/reference/dsl/` (typically `features.md` and/or `geometry.md`).
   - Render PNGs + manifest: `npm run docs:examples` (writes to `docs/public/examples/dsl/`).

5. Tests (per-feature)
   - Add a new e2e test in `src/tests/*.e2e.test.ts`.
   - Run only the impacted test: `npm run build -- --pretty false` then
     `node dist/tests/<test>.js`.

6. Optional viewer asset
   - If you need viewer assets: `npm run viewer:export`
   - Filter with `TF_VIEWER_ONLY=part-a,part-b`.

## Feature Visual Signoff Workflow (Required for new/changed features)

Use this workflow for feature development and promotion decisions.

1. Build + targeted tests (agent)
   - Run `npm run build -- --pretty false`.
   - Run only impacted tests:
     - feature conformance e2e (`src/tests/occt.<feature>.e2e.test.ts`)
     - feature failure-mode e2e (`src/tests/occt.<feature>.failure_modes.e2e.test.ts` when applicable)
     - determinism/parity probe (`src/tests/occt.<feature>.e2e.probe.ts` when applicable)

2. Render visual artifacts (agent)
   - Add/update DSL example in `src/examples/dsl_feature_examples.ts`.
   - Run `npm run docs:examples`.
   - Ensure review PNG is produced in `docs/public/examples/dsl/<example>.iso.png`.

3. Interactive review package (agent + reviewer)
   - Export viewer assets with `TF_VIEWER_ONLY=<example-id> npm run viewer:export`.
   - Serve viewer with `npm run viewer:serve`.
   - Include exact artifact paths in the review summary.
   - On WSL, use `wslview <linux-path>` to open local files in Windows (including review images). Do not rely on `xdg-open`, which targets Linux-side GUI apps and is unreliable for this setup.

4. Reviewer visual approval (reviewer)
   - Reviewer checks generated images/viewer output and replies with explicit approval.
   - Approval phrase can be simple: `approved`.

5. Promotion + PR trigger (agent)
   - Once reviewer approves, immediately:
     - promote feature stage (`src/feature_staging.ts`) when applicable
     - update parity/docs (`specs/geometric-benchmark-corpus.json`, `specs/geometric-parity-matrix.md`, `specs/geometric-parity-plan.md`)
     - run parity report (`npm run parity:geometric:report`)
     - commit and open/publish PR

Rule: Do not mark a feature complete or promoted without visual review artifacts
and explicit reviewer approval.
