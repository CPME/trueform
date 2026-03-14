# TrueForm

For decades, enterprise CAD software companies have intentially obfuscated their files to create "vendor lock-in". Engineers hate their CAD systems, but can only dream of migration to better systems, that they will once again be locked into. While software has broadly seen explosive advancement, CAD has stagnated. Legacy file formats (STEP, IGES, OBJ, etc) are insufficient for reconstructing feature trees, and the CAD native file format remains locked behind closed doors. Hence we are stuck exchanging pdf drawings, and other lossy compressions of the rich machine readable detail embedded in the CAD native format. 

TrueForm aims to change that, by creating an open DSL (domain specific language) with rich abstractions that mirror the tools you are used to in enterprise CAD, and then some. Critically, it provides an intermediate representation and compiler with interchangeable backend seams.

TrueForm is a declarative, intent-first modeling layer on top of OpenCascade.js, with a live-tested native OCCT transport/server path for the currently supported feature surface. It lets agents and web apps describe **what** a part is (features, constraints, assertions) without scripting kernel steps.

The goal: hardware design that feels more like software. A single, digital definition is authored that retains the information needed to produce all the digital assets required in the product development lifecycle.

**GitHub:** [https://github.com/CPME/trueform](https://github.com/CPME/trueform)

## What It Is

- A deterministic intent IR compiled into B-Rep geometry.
- A stable selector system (datums + semantic queries) instead of face indices.
- A backend boundary that keeps kernel types out of authoring code.

## What It Is Not

- A GUI CAD app.
- A free-form B-Rep editor.
- A promise of zero rebuild cost today.

## Status

Current scope (v1) compiles a JSON-serializable IR and builds with an OpenCascade.js backend. Runtime target is Node + OpenCascade.js, with a parity-backed native OCCT path for the currently supported native feature surface.

Implemented part feature surface includes:
- Datums and sketching (`datum.*`, `feature.sketch2d`, sketch entities/profiles).
- Core solid/surface operations (`extrude`, `surface`, `revolve`, `loft`, `sweep`, `pipe`, `mirror`, `shell`, `draft`, `thicken`, `unwrap`, `thread`, `hole`, `fillet`, `chamfer`, `boolean`).
- Direct-edit and split operations (`delete.face`, `replace.face`, `move.face`, `move.body`, `split.body`, `split.face`).
- Advanced profile operations (`rib`, `web`) with thin open-profile workflows.
- Pattern intent (`pattern.linear`, `pattern.circular`).

Consolidation note:
- Prefer `sweep` + explicit profiles for path sweeps and `booleanOp(..., op, ...)` for boolean operations.
- `pipeSweep`, `hexTubeSweep`, `union`, `cut`, and `intersect` remain available as compatibility aliases.

Staging note:
- `rib`, `web`, and surface-mode variants for `extrude`, `loft`, `sweep`, `pipeSweep`, and `hexTubeSweep` are currently marked as `staging` in the runtime feature registry (`/v1/capabilities.featureStages`).
- The remaining advertised `featureKinds` are currently `stable` (see `/v1/capabilities.featureStages`).

Outputs are named and not limited to `body:main`; helpers default to `body:<id>` or `surface:<id>` depending on feature/mode.

Assemblies, constraints, and assertions are represented in IR. Core deterministic compile remains part-centric in v1, and assembly solving/runtime helpers are exposed under `trueform/experimental`.

Public package surfaces are also available as workspace packages:
- `@trueform/core`
- `@trueform/dsl`
- `@trueform/export`
- `@trueform/api`
- `@trueform/service-client`
- `@trueform/backend-ocjs`
- `@trueform/backend-native`

The root `trueform` package remains the compatibility facade.

## Start Here

- [Getting Started](/guide/getting-started)
- [Architecture](/reference/architecture)
- [File Format (.tfp)](/reference/file-format)
- [DSL Quickstart](/reference/dsl/quickstart)
- [DSL Reference](/reference/dsl/)
- [API Reference](/reference/api)

If you need deeper internal spec details, see the repo’s `specs/` folder.
