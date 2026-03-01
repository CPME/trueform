# Documentation Map

Purpose: define the source of truth for each topic to prevent drift.

## Source of Truth

- Public-facing docs (VitePress site): `docs/`
- Generated API reference (from TSDoc): `docs/public/api` via `npm run docs:api`
- Viewer usage + mesh schema: `tools/viewer/README.md`
- Native file format (.tfp): `docs/reference/file-format.md`
- Technical spec (IR, pipeline, backend boundary): `specs/spec.md`
- V1 product contract and API tiers: `specs/v1-contract.md`
- Packaging split timeline: `specs/packaging-split-timeline.md`
- High-level overview + positioning: `specs/summary.md`
- Functional tolerancing intent: `specs/functional-tolerancing-intent.md`
- Feature maturity/staging registry: `specs/feature-staging.md`
- Runtime execution milestone plan: `specs/webapp-runtime-two-milestones.md`
- Vision-to-current-state bridge plan: `specs/vision-gap-bridge-plan-2026-03-01.md`
- Pre-feature execution board (runtime/platform before feature dev): `specs/pre-feature-sprint-board.md`
- Roadmap ideas (non-MVP): `specs/geometric-abstractions.md`
- Sketch constraint solver proposal: `specs/sketch-constraint-solver-outline.md`
- Geometric parity target matrix: `specs/geometric-parity-matrix.md`
- Geometric benchmark corpus + scoring workflow: `specs/geometric-benchmark-corpus.md`
- Geometric parity implementation tracker: `specs/geometric-parity-plan.md`
- Advanced surfacing execution plan (trim/extend/knit + boundary/fill + guides): `specs/advanced-surfacing-three-slices-plan.md`
- Unwrap implementation tracker: `specs/unwrap-progress-2026-02-24.md`

## Maintenance Rules

- If you need to change a topic, edit the source of truth doc only.
- Other docs should link to the source of truth instead of duplicating content.
- If a summary is needed, keep it brief and include a link.
- Public-facing content belongs in `docs/`.
- Durable codebase specs belong in `specs/`.
- Temporary AI notes belong in `aidocs/`.
