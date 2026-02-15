# Architecture

This is a short overview of the core concepts. The full technical specification lives in `specs/spec.md`.

## System Diagram

```mermaid
flowchart TB
  A["DSL Authoring<br/>features, selectors, tolerancing intent"] --> B["Compiler<br/>normalize + validate + dependency DAG"]
  B --> C["Deterministic Build Executor"]
  C --> D["Backend Boundary (SPI)"]
  D --> E["OpenCascade.js Kernel"]
  E --> F["Named Outputs + Selection Metadata"]
  F --> G["Mesh / STEP / Runtime APIs"]

  classDef author fill:#d6f5e3,stroke:#1b5e20,color:#0f3a14;
  classDef compile fill:#d8e9ff,stroke:#0d47a1,color:#082a61;
  classDef backend fill:#ffe5c2,stroke:#e65100,color:#6b2d00;
  classDef output fill:#f3ddff,stroke:#6a1b9a,color:#3a0f56;

  class A author;
  class B,C compile;
  class D,E backend;
  class F,G output;
```

## Intent IR (Source of Truth)

- A document is a graph of features, datums, selectors, and constraints.
- The IR is canonical, deterministic, and JSON-serializable.
- No kernel history or kernel types are stored in the IR.

## Build Pipeline (Deterministic)

1. Normalize parameters and units.
2. Build a dependency DAG.
3. Execute features in deterministic order via a backend.
4. Resolve selectors against current geometry.
5. Optionally evaluate assertions post-build; tolerancing intent is carried in IR (constraints/assertions are placeholder data in v1 compile).

## Selectors and Datums

- Datums provide stable anchors.
- Selectors are semantic queries (e.g., “largest planar face normal to +Z”).
- Ambiguity is a compile error.

## Backend Boundary

- The backend executes normalized features and returns outputs + selection metadata.
- Kernel types remain backend-internal (OpenCascade.js in v1).

For details, see:
- `specs/spec.md`
- `specs/functional-tolerancing-intent.md`
- `docs/reference/dsl/index.md`
