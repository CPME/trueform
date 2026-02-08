Below is a **clean, implementation-oriented specification** for **Functional Tolerancing Intent (FTI)** as a section of the **unified Product / Geometry IR**. This is not a separate layer; it is part of the single authoritative IR.

This deliberately treats **GD&T as a compiled artifact**, not an authoring language.

---

# Functional Tolerancing Intent (FTI)

**Specification v0.1**

## 1. Purpose and Scope

Functional Tolerancing Intent (FTI) defines a **computer-native language for expressing mechanical design intent**, bounded by manufacturing and inspection capabilities, and suitable for continuous verification.

FTI is intended to:

* Replace manual GD&T authoring as the *primary* expression of intent
* Allow deterministic, one-way compilation to GD&T/PMI/QIF/STEP
* Support solver-based validation, simulation, and optimization
* Enable function-driven design workflows (assembly-level constraints are optional in v1)

FTI is **not** a drafting standard.
FTI is **not** a replacement for downstream interoperability formats.
FTI is the **authoritative source of functional tolerancing intent** within the IR.

**FTI is a section of the unified IR**, not a separate IR. It lives alongside geometry, semantic references, inspection semantics, and outputs.

---

## 2. Design Principles

1. **Intent over notation**
   Constraints describe *what must remain true*, not *how it is symbolized*.

2. **Computable by construction**
   All constraints are machine-checkable without human interpretation.

3. **Capability-aware**
   Validity is always evaluated relative to explicit manufacturing and inspection capability sets.

4. **Assembly-aware (future)**
   Constraints may be authored at the assembly level and propagate to parts (optional in v1).

5. **One-way projection**
   GD&T, PMI, and inspection artifacts are generated outputs, never sources of truth.

6. **Conservative correctness**
When lowering to legacy formats, FTI favors over-constraint over ambiguity.

---

## 3. Conceptual Model

```
Functional Requirements
        ↓
Functional Tolerancing Intent (authoritative)
        ↓
Geometric Envelope Solving
        ↓
Derived Artifacts
  (GD&T / PMI / QIF / STEP / CMM)
```

FTI defines **allowed geometric state spaces**, not nominal perfection plus tolerances.

---

## 4. Core Concepts

### 4.1 Geometry References (GeometryRef)

FTI constraints attach to **stable geometric references**, not transient topology.

#### Required reference types

* `RefPoint`
* `RefAxis`
* `RefPlane`
* `RefSurface`
* `RefFrame` (coordinate frame derived from geometry)
* `RefFeature` (convenience wrapper around surfaces + axes)

Each GeometryRef MUST:

* have a persistent identifier
* resolve to B-rep or parametric geometry
* be evaluable in part and assembly context

**Resolution model:** GeometryRefs are defined in terms of **datums and selectors** (and named selections) from the Intent IR. A GeometryRef is a stable handle that resolves via the same selector pipeline used by features.

**Assembly scope:** Constraints may target GeometryRefs across multiple parts. Assembly support is optional in v1 but the IR reserves an `assemblies` section for this.

---

### 4.2 Constraints

A **Constraint** defines bounds on allowable variation.

Constraints are declarative and order-independent.

Each constraint MUST specify:

* target GeometryRefs
* primitive type
* numeric bounds (with units)
* evaluation mode
* applicable capability context
* provenance (functional requirement linkage)

---

## 5. Minimal Constraint Primitive Set

This is the **authoritative authoring set**.

### 5.1 Size Bound

```text
size(parameter) ∈ [min, max]
```

Applies to:

* diameters
* widths
* thicknesses
* distances

---

### 5.2 Relative Pose Bound

Controls full or partial 6-DOF motion between frames.

```text
pose(subject_frame relative_to reference_frame):
  Δx ∈ [a,b]
  Δy ∈ [c,d]
  Δz ∈ [e,f]
  Δrx ∈ [g,h]
  Δry ∈ [i,j]
  Δrz ∈ [k,l]
```

This is the **primary workhorse primitive**.

---

### 5.3 Distance Bound

```text
distance(geomA, geomB) ∈ [min, max]
```

Used for:

* gaps
* offsets
* standoffs
* thickness stacks

---

### 5.4 Angle Bound

```text
angle(directionA, directionB) ∈ [min, max]
```

---

### 5.5 Form / Surface Deviation Bound

```text
deviation(surface, metric) ≤ t
```

Supported metrics:

* planar deviation
* radial deviation
* normal offset envelope (profile-like)

---

### 5.6 Clearance / Non-Interference

```text
min_clearance(partA, partB, region) ≥ c
```

This is **non-representable in pure GD&T**, but allowed in FTI.

---

## 6. Capability Sets

A **CapabilitySet** defines what variation is realistically achievable.

### 6.1 Manufacturing Capability

* process type
* achievable positional accuracy
* form stability
* feature size limits
* process distributions (optional)

### 6.2 Inspection Capability

* metrology method
* uncertainty bounds
* accessible features
* sampling assumptions

Constraints are valid **only if satisfiable under at least one CapabilitySet**.

Capability sets are part of the Intent IR `capabilities` section and are referenced by constraints during validation.

---

## 7. Functional Requirements

Constraints SHOULD be derived from explicit **Requirements**.

A Requirement:

* is human-meaningful
* describes function, assembly, or verification intent
* links to one or more constraints

This enables:

* traceability
* explainability
* change impact analysis

---

## 8. Continuous Validation

FTI systems MUST support continuous evaluation of:

* constraint satisfiability
* assembly validity
* capability compatibility
* conflict detection

Invalid states MUST be surfaced immediately.

---

## 9. GD&T / PMI Lowering Model (One-Way)

### 9.1 Compilation Contract

FTI → GD&T lowering MUST be:

* deterministic
* conservative
* traceable
* one-way

No imported GD&T may modify FTI intent.

---

### 9.2 Lowest-Common-Denominator Target

The compiler MAY restrict itself to:

* explicit datums
* size limits
* profile of surface / line

All FTI constraints MUST be representable via:

* envelope computation
* profile tolerances
* size bounds

Other GD&T constructs (position, MMC, runout) are **compiler optimizations**, not authoring primitives.

---

### 9.3 Datum Reference Frame Synthesis

If required by the target format:

* DRFs are synthesized automatically
* selection is deterministic and conservative
* derived from real geometry
* never authored manually by the user

---

### 9.4 Traceability

Each emitted GD&T characteristic MUST reference:

* originating Constraint ID
* originating Requirement ID
* capability context used

---

## 10. Inspection and Quality Artifacts

FTI constraints MAY be lowered to:

* QIF characteristics
* inspection plans
* CMM measurement features

Measurement results MAY be linked back to constraints, but MUST NOT alter intent directly.

---

## 11. Change Semantics

FTI is **parametric and re-solvable**.

On any change:

* affected constraints are re-evaluated
* derived artifacts are regenerated
* invalid projections are flagged

---

## 12. Non-Goals (Explicit)

FTI intentionally does NOT:

* expose GD&T symbols to the user
* require datum authoring
* require feature control frames
* require MMC/LMC reasoning during design
* guarantee cost-optimal tolerances without capability data

---

## 13. Summary (Normative)

> **FTI defines allowable geometric states, bounded by capability, and treats GD&T as a generated approximation.**

This abstraction:

* simplifies authoring
* increases correctness
* enables automation
* preserves interoperability
* aligns CAD with how computers actually reason
