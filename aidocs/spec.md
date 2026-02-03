## Goal

Build a **reusable TypeScript library for webapps** that lets agents author **declarative design intent** (features, datums, constraints, assertions) and **compile** it into geometry using OpenCascade.js (with a clean seam to add native Open CASCADE Technology later).

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
  * `assemblies?: AssemblyIR[]` (optional; placeholder for assembly-level constraints)
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

### AssemblyIR (placeholder)

* `id`
* `parts`: references to PartIR instances
* `mates`: optional (future)
* `constraints`: functional tolerancing intent scoped to assembly-level GeometryRefs
* `outputs`: named selection sets (as selectors, not IDs)

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
2. Sketch2D (procedural primitives; full constraint solver can come later)
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

If underconstrained: compiler error.

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
