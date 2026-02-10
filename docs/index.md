# TrueForm

For decades, enterprise CAD software companies have intentially obfuscated their files to create "vendor lock-in". Engineers hate their CAD systems, but can only dream of migration to better systems, that they will once again be locked into. While software has broadly seen explosive advancement, CAD has stagnated. Legacy file formats (STEP, IGES, OBJ, etc) are insufficient for reconstructing feature trees, and the CAD native file format remains locked behind closed doors. Hence we are stuck exchanging pdf drawings, and other lossy compressions of the rich machine readable detail embedded in the CAD native format. 

TrueForm aims to change that, by creating an open DSL (domain specific language) with rich abstractions that mirror the tools you are used to in enterprise CAD, and then some. Critically, it provides an intermediate representation and compiler (currently supports OpenCascade.js).

TrueForm is a declarative, intent-first modeling layer on top of OpenCascade.js. It lets agents and web apps describe **what** a part is (features, constraints, assertions) without scripting kernel steps.

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

Current scope (v1) compiles a JSON-serializable IR and builds with an OpenCascade.js backend. Runtime target is Node + OpenCascade.js, with a minimal feature set: `Sketch2D`, `profile.rect/circle`, `Extrude`, `Revolve`, and single-body output (`body:main`). Assemblies are data-only for now (compile warns).

## Start Here

- [Getting Started](/guide/getting-started)
- [Architecture](/reference/architecture)
- [File Format (.tfp)](/reference/file-format)
- [DSL Reference](/reference/dsl/)
- [API Reference](/reference/api)

If you need deeper internal spec details, see the repo’s `specs/` folder.
