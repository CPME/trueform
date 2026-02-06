# TrueForm

TrueForm is a declarative, intent-first modeling layer on top of OpenCascade.js. It lets agents and web apps describe **what** a part is (features, constraints, assertions) without scripting kernel steps.

The goal: hardware design that feels more like software. A single, digital definition is authored and released with rapid iteration, automated checks, and clean handoff to manufacturing.

## What It Is

- A deterministic intent IR compiled into B-Rep geometry.
- A stable selector system (datums + semantic queries) instead of face indices.
- A backend boundary that keeps kernel types out of authoring code.

## What It Is Not

- A GUI CAD app.
- A free-form B-Rep editor.
- A promise of zero rebuild cost today.

## Status

Current scope (v1) compiles a JSON-serializable IR and builds with an OpenCascade.js backend. Runtime target is Node + OpenCascade.js, with a minimal feature set: `Sketch2D`, `profile.rect/circle`, `Extrude`, `Revolve`, and single-body output (`body:main`). Assemblies are data-only for now (compile warns).

## Start Here

- [Getting Started](/guide/getting-started)
- [Architecture](/reference/architecture)
- [DSL Reference](/reference/dsl)
- [API Reference](/reference/api)

If you need deeper internal spec details, see the repo’s `aidocs/` folder.
