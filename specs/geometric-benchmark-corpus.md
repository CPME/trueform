# Geometric Benchmark Corpus

Updated: 2026-02-21

Purpose: define a reproducible, versioned benchmark corpus used to score
geometric feature parity and reliability.

Source of truth:
- Machine-readable manifest: `specs/geometric-benchmark-corpus.json`

## Entry Template

Each entry should map one representative workflow to one executable probe.

```json
{
  "id": "string-id",
  "category": "category-name",
  "feature": "human-readable feature/workflow",
  "parity": "ready | staging | missing",
  "probe": {
    "kind": "dist-test",
    "path": "dist/tests/<name>.js"
  },
  "notes": "optional implementation notes"
}
```

## Authoring Rules

1. Keep one probe per entry.
2. Reuse focused e2e tests under `src/tests/*.e2e.test.ts` where possible.
3. Set `parity` to:
   - `ready` for production-stable behavior
   - `staging` for available-but-hardening behavior
   - `missing` for not implemented behavior
4. `missing` entries may optionally include a probe when you want an intentionally-red
   parity test to track implementation progress.
5. Keep categories aligned with `specs/geometric-parity-matrix.md`.

## Running the Score Report

```bash
npm run parity:geometric:report
```

This writes:
- `temp/geometric-parity-report.json`
- `temp/geometric-parity-report.md`

Optional CI-style threshold check:

```bash
npm run parity:geometric:check
```
