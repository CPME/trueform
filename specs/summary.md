# TrueForm

TrueForm is a declarative, intent-first modeling layer that compiles to interchangeable geometric backends (OpenCascade.js today, native OCCT support in progress). It lets agents and web apps describe **what** a part is (features, constraints, assertions) without scripting kernel steps.

## What It Promises (and Not)

Promises:
- Deterministic intent compilation (given fixed backend + build context)
- Selector stability by construction (datums + explicit ranking)
- Explicit failure on ambiguity
- Kernel independence at the IR boundary

Non-promises:
- Immunity to all topology changes
- Zero rebuild cost today
- Kernel-independent numerical identity

## V1 Scope (current)

- IR-only source of truth (no kernel history stored)
- JSON-serializable builders
- Core compile is part-centric in v1; assembly solving is experimental
- Features: `Sketch2D` (line/arc/circle/ellipse/rect/slot/polygon/spline/point), `profile.rect/circle/poly/sketch`, `Extrude`, `Surface`, `Revolve`, `Loft`, `Sweep`, `Pipe`, `PipeSweep`, `HexTubeSweep`, `Mirror`, `Shell`, `Draft`, `Thicken`, `Thread`, `Hole`, `Pattern` (linear/circular layout + feature/body replication), `Fillet`, `Chamfer`, `Boolean`
- Primary output: `body:main` (single-body v1)
- Runtime target: Node + OpenCascade.js
- Export tooling exists in dedicated modules (`src/export/*`) and is distinct from core compile
- Unsupported features (e.g., rib, full feature/body patterns) must throw explicit errors in the OCJS backend. `Draft` is now available as a staging feature.

## What Problem It Solves

Kernel APIs are powerful but stateful. Geometry depends on execution order, references are brittle, and intent is hard to inspect. TrueForm introduces a deterministic IR that encodes intent directly and resolves semantic selectors at build time, enabling stable rebuilds and meaningful diffs.

## Who It’s For

- Agent-driven CAD systems
- Web-based CAD and configuration tools
- Parametric part generators
- Manufacturing-aware pipelines

TrueForm is not a GUI CAD app. It is a modeling abstraction layer intended to sit under UIs and agents.

## How It Differs From Direct Kernel Scripting

| Direct kernel scripting          | TrueForm                     |
| -------------------------------- | ---------------------------- |
| Imperative command sequences     | Declarative intent graph     |
| Face/edge IDs                    | Datums + semantic selectors  |
| Geometry = state                 | Geometry = compiled artifact |
| Constraints implicit or external | Constraints as data          |
| Hard to diff/review              | Serializable, reviewable     |
| Agent-hostile                    | Agent-first                  |

## Core Concepts (short)

- Declarative intent graph with stable references
- Semantic features (a hole is a hole, not a cylinder cut)
- Datums + selectors instead of face indices
- Single authoritative IR for geometry + FTI + assertions

## Minimal Example

```ts
import { dsl, buildPart } from "trueform";

const part = dsl.part("plate", [
  dsl.sketch2d("sketch-base", [
    { name: "profile:base", profile: dsl.profileRect(100, 60) },
  ]),
  dsl.extrude(
    "base-extrude",
    dsl.profileRef("profile:base"),
    6,
    "body:main",
    ["sketch-base"]
  ),
]);

// Compile + build with a backend (ocjs in v1, via local tooling)
// const result = buildPart(part, backend);
```

## Where To Look Next

- Technical spec (IR, pipeline, backend boundary): `specs/spec.md`
- Functional tolerancing intent: `specs/functional-tolerancing-intent.md`
- V1 contract and API tiers: `specs/v1-contract.md`
- Roadmap abstractions (future ideas): `specs/geometric-abstractions.md`
