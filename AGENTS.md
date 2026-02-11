# Vision
To create the open sourced CAD tools and standards that enables the world of hardware design to flourish as the world of software has, by creating:
1. Core: DSL + IR + deterministic compiler/validator + selector semantics.
1. Backends: Swappable OCCT.js/native OCCT adapters behind a narrow interface. Kernel objects are backend-internal.
1. Tooling: Exporters, viewer pipeline, docs/examples, and app SDKs in separate packages that depend on core.

## Stable Contracts

- Stable public API exposes IR + selector semantics + compiler + build artifacts only.
- Kernel objects/types must never appear in the stable public API.
- Convenience wrappers belong in `tools/` or separate `packages/*` and may evolve faster than core.

## Performance
Make sure this is practical for use in a webapp. OCCT.js is an execution backend that runs out-of-process (for example server-side Node/wasm), while the browser receives meshes + semantic selection metadata only. Avoid choices that block complex assemblies or responsive rotation later.

## Webapp Footguns (avoid these)

- Do not leak B-Rep objects to the browser. Keep OCCT shapes in the backend and stream meshes.
- Do not require synchronous backend calls for long operations. Plan for async build/mesh/export.
- Do not assume stable face/edge IDs. Use selectors + datums and re-resolve each rebuild.
- Compiler must be deterministic and total. Ambiguity is a hard error unless disambiguated in IR (for example with additional constraints or explicit datum). No heuristic resolution in core compilation.
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

1. Classify the change
   - Classify as Core (IR/compiler/selectors), Backend, Exporter, Tooling, or Viewer.
   - If not Core, implement outside core `src/` modules.
   - For Backend/Exporter/Tooling/Viewer work, do not add new public core API unless explicitly required.

2. Update the DSL surface
   - Types: `src/dsl.ts` (feature types + intent union).
   - Helpers: `src/dsl/geometry.ts` (builder function + options).

3. Compiler + validation
   - Normalize new scalars: `src/compiler.ts`.
   - Validate shape + invariants: `src/validate.ts`.

4. Backend execution
   - Implement OCCT behavior: `src/backend_occt.ts`.
   - Prefer primitives that exist in `opencascade.js` and reuse helpers like
     `makeCylinder`, `makeCone`, `makeBoolean`, `splitByTools`.

5. Examples + docs
   - Add/extend DSL example: `src/examples/dsl_feature_examples.ts`.
   - Update docs: `docs/reference/dsl.md`.
   - Render PNGs + manifest: `npm run docs:examples` (writes to `docs/public/examples/dsl/`).

6. Tests (per-feature)
   - Add a new e2e test in `src/tests/*.e2e.test.ts`.
   - Run only the impacted test: `npm run build -- --pretty false` then
     `node dist/tests/<test>.js`.

7. Optional viewer asset
   - If you need viewer assets: `npm run viewer:export`
   - Filter with `TF_VIEWER_ONLY=part-a,part-b`.
