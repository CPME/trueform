# Getting Started

## Prerequisites

- Node.js (LTS recommended)
- npm

## Install

```bash
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

// Provide a backend (OpenCascade.js in v1).
// const backend = ...;
// const result = buildPart(part, backend);
```

`buildPart` returns a deterministic build result with the final outputs and per-feature steps. For a concrete example, see `src/examples/hello.ts`.

## Quick Mesh Export (Viewer)

```bash
npm run viewer:export
```

Then serve the viewer:

```bash
cd tools/viewer
npm install
python3 -m http.server 8001
```

Open `http://localhost:8001` in your browser.

For viewer details and mesh schema, see `tools/viewer/README.md`.
