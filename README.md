# TrueForm

TrueForm is a declarative, intent-first modeling layer on top of OpenCascade.js. It lets agents and web apps describe what a part is (features, constraints, assertions) without scripting kernel steps.

The goal: hardware design that feels more like software. A single, digital definition is authored and released with rapid iteration, automated checks, and clean handoff to manufacturing.

**Status**
- V1 compiles a JSON-serializable IR and builds with an OpenCascade.js backend.
- Current runtime target is Node + OpenCascade.js.
- Assemblies are data-only for now (compile warns).

**Quickstart**
```bash
git clone https://github.com/CPME/trueform.git
cd trueform
npm install
npm test
```

**Minimal Example**
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

// const result = buildPart(part, backend);
```

**Viewer (Verification Helper)**
Screenshot: generated from the DSL and viewed with the packaged viewer.

![TrueForm viewer screenshot](tf-web-viewer-screenshot.png)

```bash
npm run viewer:export
```

Viewer setup, mesh schema, and options: `tools/viewer/README.md`.

**Docs**
- Overview and positioning: `aidocs/summary.md`
- Technical spec (IR, pipeline, backend boundary): `aidocs/spec.md`
- Functional tolerancing intent: `aidocs/functional-tolerancing-intent.md`
- Viewer helper + mesh schema: `tools/viewer/README.md`
- Docs map (source-of-truth guide): `aidocs/docs-map.md`
