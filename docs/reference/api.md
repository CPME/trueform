# API Reference

The API reference is generated from TSDoc comments in the source.

## Public Entrypoints

Use explicit import paths by stability tier:

- `trueform`: stable core IR/DSL/compile/build contracts.
- `trueform/backend`: backend implementations (for runtime wiring).
- `trueform/backend-spi`: backend interfaces/adapters for backend authors.
- `trueform/export`: export tooling helpers (STEP/GLB/3MF/SVG/DXF).
- `trueform/api`: runtime API contracts (typed endpoint constants, job envelopes, and OpenAPI object).
- `trueform/experimental`: unstable/experimental APIs (for example assembly solver and native transport helpers).

Runtime guidance:
- Treat `/v1/capabilities` as the source of truth for optional surface support (`optionalFeatures`), not route existence assumptions.

## Generate

```bash
npm run docs:api
```

This writes static HTML into `docs/public/api` (not committed).

## View

When running the docs site, open:

- `/api/`

<a class="vp-raw" href="/trueform/api/">Open the API Reference</a>

If you need to regenerate after changes, re-run `npm run docs:api`.
