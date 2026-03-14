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

## Verify The Package Surfaces

```bash
npm run verify:workspace-packages
```

This checks the public workspace package entrypoints and their parity with the
root `trueform` compatibility facade.

## Run the Example

```bash
npm run example
```

## Basic Usage

```ts
import { buildPart, dsl } from "trueform";

const plate = dsl.part("plate", [
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

// Provide a backend (OpenCascade.js in v1).
// const backend = ...;
// const result = buildPart(plate, backend);
```

`buildPart` returns a deterministic build result with the final outputs and per-feature steps. For a concrete example, see `src/examples/hello.ts`.

## Native Backend Verification

```bash
npm run verify:native-live
```

This rebuilds the repo, rebuilds the native OCCT server, and runs the live
native HTTP, PMI export, and native-vs-direct parity checks for the currently
supported native feature set.

## Quick Mesh Export (Viewer)

```bash
npm run viewer:export
```

For viewer setup, details, and mesh schema, see `tools/viewer/README.md`.
