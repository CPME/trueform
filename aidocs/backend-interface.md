# Backend Interface (v1)

TrueForm backends execute **normalized** features and return kernel outputs + selection metadata. The backend boundary is intentionally small and kernel-agnostic.

## Contract

**Input**: `Backend.execute({ feature, upstream, resolve })`

* `feature`: normalized intent feature (numbers in canonical units, selectors normalized).
* `upstream`: accumulated kernel outputs + selections from previous features.
* `resolve(selector, upstream)`: helper for resolving selectors against upstream selections.

**Output**: `KernelResult`

* `outputs`: `Map<string, KernelObject>` (e.g., `body:main`).
* `selections`: `KernelSelection[]` emitted by the backend for later selectors.

Backends **must throw explicit errors** for unsupported feature kinds (no silent no-ops).

## Required selection metadata (for selectors)

Selectors are evaluated purely from metadata on `KernelSelection.meta`. If required metadata is missing, selector resolution throws a compile error.

Predicates:
* `pred.planar` → `meta.planar: boolean`
* `pred.normal` → `meta.normal: AxisDirection`
* `pred.createdBy` → `meta.createdBy: string` (feature id)
* `pred.role` → `meta.role: string`

Ranking rules:
* `rank.maxArea` → `meta.area: number`
* `rank.minZ` / `rank.maxZ` → `meta.centerZ: number`
* `rank.closestTo` → `meta.distanceTo: number` (backend must precompute)

## V1 scope reminders

* Supported features: `Sketch2D`, `profile.rect/circle`, `Extrude`, `Revolve`
* Unsupported features must throw `not supported in v1`
* Single primary output: `body:main`
* Node + OpenCascade.js is the v1 runtime target; ocjs types stay out of DSL
