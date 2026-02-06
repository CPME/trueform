## Performance
Make sure this is practical for use in a webapp (can it compile to opencascade.js, and then wasm, without footguns). Avoid choices that block complex assemblies or responsive rotation later.

## Docs Pointers

- Viewer helper (export/run/mesh schema): `tools/viewer/README.md`
- Technical spec (IR, pipeline, backend): `aidocs/spec.md`
- Overview and positioning: `aidocs/summary.md`
- Functional tolerancing intent: `aidocs/functional-tolerancing-intent.md`
- Documentation source-of-truth map: `aidocs/docs-map.md`

## Tests

Write tests as you build features. Run the test after you build the feature to verify it works as intended.

When you are building features, only test the impacted features. Each feature gets it's own test.

Run all tests (build + e2e):

```bash
cd /home/eveber/code/trueform
npm test
```
