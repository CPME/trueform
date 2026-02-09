## Goal

Build a **reusable TypeScript library for webapps** that lets agents author **declarative design intent** (features, datums, constraints, assertions) and **compile** it into geometry using OpenCascade.js (with a clean seam to add native Open CASCADE Technology later).

Audience: implementers. For a high-level overview, see `specs/summary.md`.

---

## Deliverable structure (recommended monorepo)

### Package 1: `@cad/intent`

**Pure TS. No WASM. No kernel types.**

* Intent IR types (Document/Part/Feature/Datum/Selector/Assertion)
* Builders (nice API for agents)
* Normalizer (units, expression eval, canonical ordering)
* Dependency DAG planner (deterministic feature order)
* Selector DSL + resolver interface (backend-agnostic)
* Assertion DSL (data only) + evaluation plan
* Validation: under/over-constrained checks for features (DoF checks)

### Package 2: `@cad/backend-ocjs`

**The OpenCascade.js executor.**

* Loads OpenCascade.js/WASM (bundler-friendly)
* Implements `KernelBackend` interface for:

  * building features into B-Rep
  * resolving selectors to concrete subshapes
  * exporting (mesh/STEP/STL as supported)
* Implements evaluators for assertions (cheap/local tier)

(Optional later) Package 3: `@cad/backend-occt` (server/native)

---

## Core abstraction: Intent IR (Source of truth)

A design document is a **specification** that compiles into geometry and is verifiable.
It is the **single authoritative IR** for geometry, semantic references, functional tolerancing intent, and inspection meaning.

### IR top-level

* `DocumentIR`

  * `units`
  * `parts: PartIR[]`
  * `assemblies?: AssemblyIR[]` (optional; data-only assembly graph)
  * `capabilities` (manufacturing + inspection capability sets, including tolerances)
  * `constraints` (functional tolerancing intent; authoritative bounds)
  * `assertions` (cheap/local checks; not authoritative)

### PartIR

* `params`: typed (length, angle, count) + expressions
* `datums`: planes/axes/frames (stable anchors)
* `features`: semantic nodes (Hole ≠ cylinder cut)
* `constraints`: functional tolerancing intent (authoritative bounds)
* `assertions`: lightweight local checks (non-authoritative)
* `outputs`: named bodies + named selection sets (as selectors, not IDs)

### AssemblyIR (v1 data-only)

* `id`
* `instances`: part instances with transforms
  * `{ id, part, transform?, tags? }`
* `mates?`: assembly intent constraints (no solver in v1)
  * `mate.fixed`
  * `mate.coaxial`
  * `mate.planar` (optional offset)
  * `mate.distance` (optional distance)
  * `mate.angle` (optional angle)
  * `mate.parallel`
  * `mate.perpendicular`
  * `mate.insert` (optional offset)
  * `mate.slider`
  * `mate.hinge` (optional offset)
* `outputs?`: named selection sets using `AssemblyRef`

Types:

* `AssemblyRef = { instance, selector }`
* `Transform = { translation?, rotation?, matrix? }`
  * `matrix` is a 4x4 column-major array (length 16)

Notes:

* Transforms are authoritative in v1; mates are recorded as intent/validation.
* Assembly selectors always scope through an instance id + selector.

### Feature node contract

Each feature is a node with:

* `id` (stable UUID)
* `type` (Sketch2D, Extrude, Revolve, Hole, Fillet, Chamfer, Boolean, Pattern…)
* `inputs`:

  * datums or upstream outputs
  * **selectors** (semantic queries), never face indices
* `params` (numbers/enums/expressions)
* `tags` (semantic labels)
* optional `guards` (lightweight invariants attached to the feature)

**No kernel commands stored.** The IR is not a replay log.

---

## Reference stability: selectors + datums (no persistent face IDs)

### Datums

* `DatumPlane`, `DatumAxis`, `Frame` (coordinate frame)
  Used for: feature placement, hole axes, pattern frames, assembly mates later.

### Selector DSL (semantic selection)

A small query language that resolves against current geometry state:

* Face predicates: `kind=planar|cylindrical`, `normal`, `rank=maxArea`, `coaxialWith(axis)`, `atZ=max`, etc.
* Edge predicates: `circular`, `radius≈x`, `onFace(selector)`
* Body predicates: `main`, `createdBy(featureId)`, `tag=...`

Selectors are:

* deterministic
* serializable
* re-resolved each rebuild

Features may emit **named selections** as selectors for downstream use.

---

## Functional Tolerancing Intent (FTI) and Assertions (local checks)

Functional tolerancing intent lives in the same document as geometry and is the **authoritative** expression of bounds. It is **data not code** so:

* they are diffable/reviewable
* multiple evaluators can check them (browser fast vs CI robust)

FTI is a section of the unified IR; it is not a separate layer.

Assertions are **secondary**: cheap, local checks and validity probes that do **not** define tolerances.

Terminology: in this spec, **constraints** means functional tolerancing intent. Sketch relations are called **sketch constraints** and do not persist in the IR.

### FTI Constraint DSL (v1 set)

Start with the FTI primitives defined in the FTI spec:

* size bound
* pose bound
* distance bound
* angle bound
* surface deviation bound
* clearance / non-interference

### Assertion DSL (v1 set)

Start with ~10–15:

* `brepValid`
* `minWallThickness(value, scope)`
* `minEdgeLength(value, scope)`
* `minFilletRadius(value, scope)`
* `drillable(direction, scope)` (3-axis access)
* `minEdgeDistance(value, scope)` (e.g., hole margin)
* `keepOut(volume/region, scope)`
* `fit/clearance` (optional later)

### Enforcement tiers

* Local (interactive): cheap checks every compile
* CI: expensive checks + assembly checks (out of scope for v1 runtime, but the model supports it)

Do **not** store assertion results in the IR—results are build artifacts.

---

## Compiler pipeline (deterministic)

Implemented in `@cad/intent`, executed with a backend.

1. **Normalize**

   * units
   * evaluate expressions
   * canonical ordering (patterns, boolean operands, etc.)

2. **Plan**

   * build dependency DAG from feature inputs
   * deterministic topological sort (tie-break on feature id)
   * hybrid dependencies: explicit `feature.deps` plus inferred anchors (`profile.ref`, `pattern.ref`, `selector.named`, `pred.createdBy`, `rank.closestTo`)
   * selectors without anchors require explicit deps; missing anchors are compile errors

3. **Build**

   * for each feature in plan order:

     * resolve inputs (datums, prior outputs)
     * resolve selectors via backend
     * execute backend ops (OpenCascade.js)
     * attach outputs (bodies + named selections)

4. **Validate**

   * run FTI constraint checks (capability-bounded)
   * run local-tier assertion evaluators
   * run cheap geometry validity checks

5. **Emit**

   * B-Rep handles (backend-specific, not serialized)
   * mesh for rendering
   * provenance map (feature → produced bodies, tags, named selections)

---

## Webapp footgun avoidance (MVP)

We are not optimizing for peak runtime performance yet, but we must avoid
choices that make complex assemblies unusable later. Minimal safeguards:

* **Separate B-Rep from render mesh**: keep OCCT shapes in the backend; stream meshes to the viewer.
* **Mesh profiles**: allow coarse mesh for interaction, fine mesh for export.
* **Progressive refinement**: render coarse mesh first, refine later.
* **Cache per-feature and per-part**: avoid re-meshing unchanged parts.
* **Instance transforms**: render repeated parts via transforms instead of duplicating mesh.
* **Async meshing**: perform meshing off the main thread (worker) when used in-browser.

---

## Backend interface (what the agent library compiles into)

Define a strict boundary:

```ts
export interface KernelBackend {
  beginBuild(ctx: BuildContext): Promise<void>;

  // Execute a feature; returns updated bodies and a selection context.
  execFeature(
    feature: FeatureIR,
    resolvedInputs: ResolvedInputs
  ): Promise<FeatureResult>;

  // Resolve a selector into backend-specific subshape handles
  resolveSelector(selector: SelectorIR, scope: SelectionScope): Promise<SelectionHandle>;

  // Optional exports
  exportSTEP?(body: BodyHandle): Promise<ArrayBuffer>;
  exportSTL?(body: BodyHandle, opts?: MeshOpts): Promise<ArrayBuffer>;
  mesh(body: BodyHandle, opts?: MeshOpts): Promise<MeshData>;

  endBuild(): Promise<void>;
}
```

Backend implementation uses OpenCascade.js primitives (TopoDS_Shape, etc.) internally but never exposes them to callers.

---

## Feature set for MVP (enough to prove the abstraction)

Implement these IR features + OpenCascade.js compilation:

1. Datums: plane/axis/frame
2. Sketch2D (procedural primitives + ordered loop profiles; full constraint solver can come later)
3. Extrude (boss/cut)
4. Revolve (boss/cut)
5. Hole (semantic): simple + counterbore/countersink (optional), through/blind, axis from datum, position from frame or pattern
6. Fillet / Chamfer
7. Boolean: union/subtract/intersect (transactional grouping)
8. Pattern: linear + circular
9. Simple selection queries for faces/edges needed by the above

---

## Positioning rules (avoid under-specified features)

Every feature must fully constrain its DoF at compile time. Examples:

* Hole requires: `onFace` + `axis` + `position` (frame coords or sketch constraints) + `size` + `depth`
* Pattern requires: `origin frame` + `spacing` + `count` (or equivalent)
* `profile.sketch` requires: ordered loop of sketch entity ids that form a closed wire; optional `holes` are additional closed loops

If underconstrained: compiler error.

---

## Sketch Profiles (`profile.sketch`)

Sketch2D supports **explicit loop-based profiles** for arbitrary closed sketches.
This avoids implicit loop finding and keeps builds deterministic.

IR shape:

```ts
{
  kind: "profile.sketch",
  loop: ["entity-1", "entity-2", "entity-3", ...],
  holes?: [["hole-entity-1", "hole-entity-2", ...], ...]
}
```

Rules:
- `loop` is an **ordered** list of sketch entity ids that must form a **closed** wire.
- `holes` are additional ordered closed loops (optional).
- Entities live on the parent `Sketch2D` feature (`sketch.entities`).
- `profile.sketch` must be consumed via `profileRef` (not inline) so the backend can access the sketch’s entities and plane.

Supported entity kinds (v1):
- `sketch.line`, `sketch.arc`, `sketch.circle`, `sketch.ellipse`
- `sketch.rectangle`, `sketch.slot`, `sketch.polygon`, `sketch.spline`

Usage (DSL):

```ts
const sketch = dsl.sketch2d("sketch-base", [
  { name: "profile:loop", profile: dsl.profileSketchLoop(["line-1","line-2","line-3","line-4"]) },
], {
  entities: [
    dsl.sketchLine("line-1", [0,0], [40,0]),
    dsl.sketchLine("line-2", [40,0], [40,20]),
    dsl.sketchLine("line-3", [40,20], [0,20]),
    dsl.sketchLine("line-4", [0,20], [0,0]),
  ],
});

dsl.extrude("sketch-extrude", dsl.profileRef("profile:loop"), 8, "body:main", ["sketch-base"]);
```

---

## Incremental rebuild + caching (optional but recommended early)

Feature-level cache keyed on:

* normalized feature params
* resolved selector definitions (not resolved IDs)
* upstream feature hashes
* build context (tolerances, meshing profile, backend version)

Rebuild from earliest affected node.

---

## Practical build context (needed for determinism)

`BuildContext` includes:

* modeling/meshing parameters (sewing, booleans, meshing profile)
* meshing profile (preview vs export)
* backend version stamp
* optional capability selection (which capability set to validate against)

---

## What the agent should implement first

1. `@cad/intent`: IR TS types + normalizer + DAG planner + compile driver skeleton
2. Selector DSL (small predicate set) + placeholder resolver interface
3. `@cad/backend-ocjs`: load OpenCascade.js + implement:

   * Sketch primitives → wires/faces
   * Extrude/Revolve
   * Hole
   * Fillet/Chamfer
   * Boolean
   * Simple selector resolution (planar max area, normal, cylindrical coaxial)
4. Local assertion evaluators: `brepValid`, `minEdgeLength`, basic `drillable` (simplified)
5. Mesh output for rendering

That gets you a working end-to-end: **Intent IR → compile → B-Rep → mesh → assertions** in a webapp.

---
