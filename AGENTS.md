## Performance
Make sure this is practical for use in a webapp (can it compile to opencascade.js, and then wasm, without footguns). Avoid choices that block complex assemblies or responsive rotation later.

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
