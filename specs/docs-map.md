# Documentation Map

Purpose: define the source of truth for each topic to prevent drift.

## Source of Truth

- Public-facing docs (VitePress site): `docs/`
- Generated API reference (from TSDoc): `docs/public/api` via `npm run docs:api`
- Viewer usage + mesh schema: `tools/viewer/README.md`
- Native file format (.tfp): `docs/reference/file-format.md`
- Technical spec (IR, pipeline, backend boundary): `specs/spec.md`
- V1 product contract and API tiers: `specs/v1-contract.md`
- High-level overview + positioning: `specs/summary.md`
- Functional tolerancing intent: `specs/functional-tolerancing-intent.md`
- Roadmap ideas (non-MVP): `specs/geometric-abstractions.md`

## Maintenance Rules

- If you need to change a topic, edit the source of truth doc only.
- Other docs should link to the source of truth instead of duplicating content.
- If a summary is needed, keep it brief and include a link.
- Public-facing content belongs in `docs/`.
- Durable codebase specs belong in `specs/`.
- Temporary AI notes belong in `aidocs/`.
