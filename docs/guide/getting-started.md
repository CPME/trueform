# Getting Started

## Prerequisites

- Node.js (LTS recommended)
- npm

## Install

```bash
git clone https://github.com/CPME/trueform.git
cd trueform
npm install
```

## Build

```bash
npm run build
```

## Run the Example

```bash
npm run example
```

## Basic Usage

```ts
import { buildPart } from "trueform";
import { part } from "trueform/dsl/core";
import { extrude, profileRect, profileRef, sketch2d } from "trueform/dsl/geometry";

const plate = part("plate", [
  sketch2d("sketch-base", [
    { name: "profile:base", profile: profileRect(100, 60) },
  ]),
  extrude(
    "base-extrude",
    profileRef("profile:base"),
    6,
    "body:main",
    ["sketch-base"]
  ),
]);

// Provide a backend (OpenCascade.js in v1).
// const backend = ...;
// const result = buildPart(plate, backend);
```

`buildPart` returns a deterministic build result with the final outputs and per-feature steps. For a concrete example, see `src/examples/hello.ts`.

## Quick Mesh Export (Viewer)

```bash
npm run viewer:export
```

For viewer setup, details, and mesh schema, see `tools/viewer/README.md`.
