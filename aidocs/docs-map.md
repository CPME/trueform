# Documentation Map

Purpose: define the source of truth for each topic to prevent drift.

## Source of Truth

- Public-facing docs (VitePress site): `docs/`
- Generated API reference (from TSDoc): `docs/public/api` via `npm run docs:api`
- Viewer usage + mesh schema: `tools/viewer/README.md`
- Technical spec (IR, pipeline, backend boundary): `aidocs/spec.md`
- High-level overview + positioning: `aidocs/summary.md`
- Functional tolerancing intent: `aidocs/functional-tolerancing-intent.md`
- Roadmap ideas (non-MVP): `aidocs/geometric-abstractions.md`
- Backend interface pointer (short): `aidocs/backend-interface.md`

## Maintenance Rules

- If you need to change a topic, edit the source of truth doc only.
- Other docs should link to the source of truth instead of duplicating content.
- If a summary is needed, keep it brief and include a link.
- Public-facing content belongs in `docs/`; internal/agent notes belong in `aidocs/`.
