# TrueForm

**TrueForm is a declarative, intent-first modeling layer built on top of OpenCascade.js**, designed for agents and web applications that need to generate, edit, and validate mechanical geometry without directly scripting kernel commands.

TrueForm separates **design intent** (features, constraints, assertions) from **kernel execution** (B-Rep operations). Instead of writing imperative sequences of OpenCascade calls, users and agents author a **stable intent graph** that compiles deterministically into geometry.

> TrueForm is deterministic because it treats geometry as a compiled artifact from a normalized, dependency-ordered intent graph, and it enforces selector completeness and ranking so that no kernel-execution history can influence meaning.

---

## Re-stated, tightened promises

To avoid over-claiming, TrueForm explicitly promises:

* **Deterministic intent compilation** (given a fixed backend + context)
* **Selector stability by construction**, not by accident
* **Explicit failure on ambiguity**, not silent guessing
* **Kernel independence at the IR boundary**, not magical portability

And it explicitly does *not* promise:

* immunity to all topology changes
* zero rebuild cost today
* kernel-independent numerical identity

---

## What problem TrueForm solves

Modern CAD kernels (OCCT, pythonOCC, OpenCascade.js) expose **procedural, stateful APIs**. These APIs are powerful but brittle:

* Geometry depends on execution order and hidden state
* Downstream features reference unstable face/edge IDs
* Manufacturing constraints live outside the model
* Agents must “replay history” to understand intent

TrueForm solves this by introducing an **intermediate representation (IR)** that:

* Encodes *what the part is*, not *how it is constructed*
* Uses semantic references (datums, queries), not face indices
* Treats constraints and design rules as first-class data
* Can be recompiled, validated, and diffed deterministically

---

## Who TrueForm is for

* **AI / agent-driven CAD systems**
* **Web-based CAD or configuration tools**
* **Parametric part generators**
* **Manufacturing-aware geometry pipelines**
* Developers who want the power of OCCT **without exposing kernel sequencing**

TrueForm is **not** a GUI CAD app. It is a **software abstraction layer** intended to sit *under* UIs and agents.

---

## How TrueForm differs from using pythonOCC / OpenCascade.js directly

| Direct kernel scripting          | TrueForm                     |
| -------------------------------- | ---------------------------- |
| Imperative command sequences     | Declarative intent graph     |
| Face/edge IDs                    | Datums + semantic selectors  |
| Geometry = state                 | Geometry = compiled artifact |
| Constraints implicit or external | Constraints as data          |
| Hard to diff/review              | Serializable, reviewable     |
| Agent-hostile                    | Agent-first                  |

TrueForm treats OpenCascade as a **backend**, not as the modeling language.

---

## Core concepts

### 1. Declarative intent graph

A model is a graph of **features** (Extrude, Hole, Fillet, Pattern, …) connected by **stable references**, not a linear script.

### 2. Semantic features

A `Hole` is a hole (diameter, depth, axis, pattern), not a boolean cut with a cylinder.

### 3. Stable references

All cross-feature references use:

* **Datums** (planes, axes, frames), or
* **Selectors** (e.g. “largest planar face normal to +Z”)

No persistent face IDs are stored.

### 4. Single authoritative IR

The IR is a canonical, deterministic product representation that encodes geometry, semantic references, functional tolerancing intent, and inspection meaning, from which CAD, GD&T/PMI, QIF, and manufacturing artifacts are derived.

There is no separate manufacturing layer. The authoring DSL is not the IR, and exports are derived views.

```text
+---------------------------------------------------------------+
| Authoring DSL (agent + human facing)                           |
|  - "through hole on top face"                                  |
|  - "5mm chamber on back-left edge"                             |
|  - "these two axes must align"                                 |
|                                                               |
|  * Expressive, semantic, readable                              |
|  * Not necessarily deterministic                               |
+---------------------------------------------------------------+
                              |
                              | (compile)
                              v
+---------------------------------------------------------------+
| Unified Product / Geometry IR (AUTHORITATIVE)                  |
|  - Canonical geometry graph                                    |
|  - Stable semantic references                                  |
|  - Datum structure / reference frames                          |
|  - Functional tolerancing intent                               |
|  - Inspection semantics                                        |
|                                                               |
|  * Single source of truth                                      |
|  * Deterministic                                                |
|  * Kernel-agnostic                                             |
+---------------------------------------------------------------+
          |                          |                          |
          v                          v                          v
+----------------+          +----------------+          +----------------+
|      CAD       |          |    GD&T / PMI  |          |    QIF / CMM   |
|    Kernel      |          |                |          |                |
+----------------+          +----------------+          +----------------+
          |                          |                          |
          v                          v                          v
       B-rep                      Drawings                 Inspection
```

| Aspect             | Lives in DSL | Lives in IR   | Lives in Export |
| ------------------ | ------------ | ------------- | --------------- |
| Geometry           | ✓            | ✓ (canonical) | ✓               |
| Semantic refs      | ✓            | ✓             | partial         |
| GD&T symbols       | ✗            | ✗             | ✓               |
| Tolerancing intent | ✓            | ✓             | ✓ (lowered)     |
| Inspection logic   | ✗            | ✓             | ✓               |

### Mini example: DSL → IR → exports

```text
DSL (authoring intent)
- "plate, 100x60x6"
- "through hole Ø5 on top face at (x=20, y=10) from center"
- "hole axis must be coaxial with datum Z"
- "clearance intent: min 0.2mm to edge"
```

```json
IR (authoritative)
{
  "units": "mm",
  "parts": [
    {
      "id": "plate",
      "datums": [
        { "id": "frame:center", "type": "Frame", "origin": [0, 0, 0], "axes": "+X,+Y,+Z" }
      ],
      "features": [
        { "id": "base", "type": "Extrude", "params": { "w": 100, "h": 60, "d": 6 } },
        { "id": "hole1", "type": "Hole", "params": { "dia": 5, "depth": "throughAll" },
          "inputs": { "onFace": "selector:top", "axis": "datum:+Z", "position": [20, 10] } }
      ],
      "constraints": [
        { "type": "coaxial", "a": "hole1.axis", "b": "datum:+Z" },
        { "type": "min_clearance", "a": "hole1", "b": "edge:outer", "min": 0.2 }
      ],
      "inspection": [
        { "target": "hole1.axis", "method": "feature-based", "ref": "datum:+Z" }
      ]
    }
  ]
}
```

```text
Exports (derived)
- CAD kernel: B-rep + mesh
- GD&T / PMI: position + clearance expressed as profile/size bounds
- QIF / CMM: feature-based measurement plan tied to datum:+Z
```

### 5. Functional tolerancing intent + assertions (design rules)

Functional tolerancing intent captures alignment, clearance, coaxiality, symmetry, and fit intent without embedding GD&T symbols.

Assertions / topology guards like:

* minimum wall thickness
* drillability direction
* edge distance
* keep-out zones

Functional tolerancing intent is **authoritative**. Assertions remain **validation-only**, lightweight checks evaluated locally or in CI.

---

## “Hello world” example

A minimal part with a base plate and four mounting holes:

```ts
import { Document, Part, Datum, Extrude, Hole, Pattern } from "trueform";

// Create a document
const doc = new Document({ units: "mm" });

// Define a part
const part = new Part("plate");

// Datums
part.add(
  Datum.plane("top", { normal: "+Z" }),
  Datum.frame("center", { on: "top" })
);

// Base solid
part.add(
  Extrude.fromRectangle({
    width: 100,
    height: 60,
    depth: 6,
    result: "body:main"
  })
);

// Hole feature (semantic)
part.add(
  Hole.simple({
    onFace: { query: "planar(normal=+Z, maxArea=true)" },
    axis: "+Z",
    diameter: 5,
    depth: "throughAll",
    pattern: Pattern.rectangular({
      origin: "datum:center",
      spacing: [40, 20],
      count: [2, 2]
    })
  })
);

doc.add(part);
```

What’s important:

* No kernel calls
* No face indices
* Position fully specified via datums + pattern
* Rebuilds deterministically

---

## Feature set (current / intended)

### Geometry

* Datums: plane, axis, frame
* Sketch primitives (procedural v1)
* Extrude / Revolve
* Hole (simple, counterbore, countersink)
* Fillet / Chamfer
* Boolean (union / subtract / intersect)
* Linear & circular patterns

### Intent infrastructure

* Typed parameters + expressions
* Feature dependency graph
* Semantic selectors
* Named outputs (query-based)

### Functional tolerancing intent (FTI)

* Pose/size/distance/angle/deviation bounds (FTI primitives)

### Assertions / topology guards

* B-Rep validity
* Minimum wall thickness
* Minimum edge distance
* Drillability direction
* Minimum fillet radius
* Keep-out regions

### Execution

* Backend: OpenCascade.js (WASM)
* Deterministic compilation
* Incremental rebuild support (planned)

---

## Design goals

* **Declarative, not procedural**
* **Kernel-agnostic IR**
* **Agent-readable and agent-safe**
* **Deterministic rebuilds**
* **Manufacturing-aware**
* **Serializable and diffable**

Non-goals (by design):

* No GUI
* No direct face editing
* No free-form B-Rep mutation

---

## Documentation & API

* `docs/intent-ir.md` – IR schema and semantics *(planned / WIP)*
* `docs/selectors.md` – selector DSL *(planned)*
* `docs/assertions.md` – design rule vocabulary *(planned)*

At present, the README and source code are the primary documentation.

---

## Summary (one paragraph version)

TrueForm is a declarative, intent-first modeling layer for OpenCascade that lets agents and web applications define mechanical parts in terms of **features, constraints, and requirements**, rather than imperative kernel commands. It replaces brittle face-indexed workflows with stable datums and semantic queries, enabling deterministic rebuilds, meaningful diffs, and manufacturing-aware validation—while still compiling down to standard OCCT geometry.


## Deterministic compilation (what this actually means)

**Claim:** Given the same Intent IR + build context, TrueForm produces the same geometry (up to kernel numerical tolerance).

**What guarantees this:**

1. **IR is order-independent**

   * Features are stored as a dependency graph, not an authoring sequence.
   * Execution order is derived by a deterministic topological sort (stable tie-breakers by feature ID).

2. **Selectors are pure functions**

   * A selector is a declarative query (predicates + ranking), not a pointer.
   * Resolution depends only on:

     * current geometry state
     * selector definition
   * No selector can “remember” prior resolutions.

3. **Explicit ranking rules**

   * Any selector that can match multiple candidates must specify a ranking rule:

     * `maxArea`, `minZ`, `closestTo(frame)`, etc.
   * If ranking is ambiguous → **compile error**, not “pick one”.

4. **Canonicalization passes**

   * Boolean operand order, pattern instance order, sketch winding, etc. are normalized before execution.
   * This removes accidental nondeterminism before hitting the kernel.

5. **Frozen build context**

   * Kernel tolerances, sewing parameters, meshing options are fixed per build profile.
   * Same IR + same context ⇒ same kernel calls.

**Non-goal:** Bit-for-bit identical B-Reps across kernel versions. Determinism is defined at the **intent → topology level**, not floating-point identity.

---

## Selector stability across topology changes

Selectors are **not magic**; they are stable only under defined conditions. TrueForm makes those conditions explicit.

### Selector classes (in order of stability)

1. **Datum-anchored selectors (most stable)**

   ```json
   FaceQuery({ kind: "planar", normal: "+Z", nearestTo: "datum:top" })
   ```

   * Anchored to explicit reference geometry.
   * Survive most upstream topology edits.

2. **Feature-scoped selectors**

   ```json
   FaceQuery({ createdBy: "f:base_extrude", role: "top" })
   ```

   * Stable as long as the feature exists.
   * Break only if the feature is deleted or semantically changed.

3. **Global semantic selectors (least stable)**

   ```json
   FaceQuery({ kind: "planar", normal: "+Z", rank: "maxArea" })
   ```

   * Stable under *small* edits.
   * Can legitimately change if design intent changes (e.g., a larger top face appears).

### Formal rules / best practices

* **Every selector must fully constrain its match set**

  * If >1 candidate remains after predicates + ranking → compile error.
* **Selectors may not depend on incidental properties**

  * No “face index”, no “first match”.
* **Critical downstream features should reference named outputs**

  * Features are encouraged to emit named selections (which are themselves selectors).
* **Breaking selector stability is treated as an intent change**

  * Not a silent bug.

### Ranking ambiguity example (compile error)

If two faces tie under the same ranking rule, TrueForm rejects the build:

```json
FaceQuery({ kind: "planar", normal: "+Z", rank: "maxArea" })
```

If there are two +Z planar faces with identical area, this produces a **compile error**. The fix is to add a second ranking predicate (e.g. `nearestTo: "datum:top"`) or anchor the query to a feature-scoped selection.

This is stricter than traditional CAD, by design.

---

## Incremental rebuild: current behavior vs plan

### Current behavior (v0 / v1)

* **Full rebuild per compile**
* Cost scales with:

  * number of features
  * kernel operation complexity
* This is acceptable for:

  * small–medium parts
  * agent iteration
  * early web usage

### Planned incremental strategy (already designed, not speculative)

* Each feature produces a **content hash** based on:

  * normalized parameters
  * resolved selector *definitions* (not IDs)
  * upstream feature hashes
  * build context
* Cache at feature boundaries:

  * if hash unchanged → reuse previous kernel result
* Rebuild from the **first affected node** forward.

Importantly:

* Incrementality is **not visible in the IR**
* It is an execution optimization, not a modeling concept

This mirrors modern compilers and build systems (Bazel/Nix-style).

---

## Kernel-agnosticism: how real is it today?

### What is kernel-agnostic *now*

* Intent IR has **zero kernel types**
* No OpenCascade classes leak into:

  * features
  * selectors
  * assertions
* All kernel interaction happens behind a single backend interface

### What is kernel-specific today

* Only one backend exists: **OpenCascade.js**
* Selector predicates are initially implemented against OCCT topology concepts
  (faces, edges, surfaces)

### What would *not* change with another backend

* IR schema
* Feature semantics
* Selector language
* Assertion vocabulary
* Build pipeline

### What *would* change

* Backend execution code
* Selector resolution implementation
* Assertion evaluators

In other words: **kernel-agnostic at the language level, kernel-specific at the executor level**—intentionally.

---

## Capabilities + functional tolerancing intent (single IR)

TrueForm stores **capabilities** (manufacturing + inspection limits, tolerances) and **functional tolerancing intent** inside the same Intent IR as geometry. FTI is authoritative; assertions are fast local checks.

Assembly-level constraints are supported in the IR as an optional `assemblies` section (placeholder in v1), allowing FTI constraints to reference multi-part GeometryRefs when needed.

This is the same separation used by:

* SQL vs query planners
* LLVM IR vs machine backends
* OpenAPI vs validators

If you want, the next useful artifact would be a short **“Selector Stability Guide”** with examples of safe vs unsafe selectors, which would likely address the remaining reviewer concern preemptively.
