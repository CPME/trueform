# API Reference

The API reference is generated from TSDoc comments in the source.

## Public Entrypoints

Use explicit import paths by stability tier:

- `trueform`: stable core IR/DSL/compile/build contracts.
- `trueform/backend`: backend implementations (for runtime wiring).
- `trueform/backend-spi`: backend interfaces/adapters for backend authors.
- `trueform/export`: export tooling helpers (STEP/GLB/3MF/SVG/DXF).
- `trueform/experimental`: unstable/experimental APIs (for example assembly solver and native transport helpers).

## Generate

```bash
npm run docs:api
```

This writes static HTML into `docs/public/api` (not committed).

## View

When running the docs site, open:

- `/api/`

[Open the API Reference](/api/)

If you need to regenerate after changes, re-run `npm run docs:api`.
