Runtime tooling in this folder is split between:
- `server.mjs`: the maintained local runtime server entrypoint used by
  `npm run runtime:serve` and `npm run runtime:serve:dist`.
- `minimal_e2e.mjs`: a manual smoke probe for checking build job behavior and
  cache reuse against a running runtime server.

`minimal_e2e.mjs` is not part of automated tests. Use it as an ad hoc
diagnostic when debugging runtime behavior:

```bash
npm run runtime:serve:dist
node tools/runtime/minimal_e2e.mjs
```

Optional environment overrides:
- `TF_RUNTIME_URL`
- `TF_RUNTIME_TFP`
