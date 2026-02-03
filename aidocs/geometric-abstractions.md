Below is a structured list of **geometric abstractions suitable for an agent-facing layer on top of Open CASCADE Technology (OCCT)**. The goal is to minimize direct B-Rep manipulation while preserving manufacturable intent, composability, and deterministic outcomes.

Note: items marked **(future)** are not part of the current MVP IR; they are optional extensions or later additions.

---

## 1. Primitive Solids (Intent-Level)

High-level solids with canonical parameters and stable topology.

* Box (L, W, H, corner treatment)
* Cylinder (D, H, axis)
* Cone / Frustum
* Sphere / Spheroid
* Torus
* Extruded profile
* Revolved profile
* Sweep (path + section)
* Loft (ordered section set)

**Why:** Agents reason better over named parameters than edge/face graphs.

---

## 2. Profiles & Sketch Primitives

2D intent objects with constraint-aware semantics.

* Line, arc, circle, ellipse
* Rectangle (centered, corner-based)
* Slot (straight, arc)
* Polygon (regular, parametric)
* Spline (control-point, curvature-limited)
* Construction geometry
* Datum points

**Abstraction:** Profile = closed region + sketch constraints + reference plane.

---

## 3. Sketch Constraints (Declarative)

Sketch constraints are first-class objects in the sketch layer, not solver-side effects.
They are distinct from **functional tolerancing intent (FTI) constraints**, which define authoritative geometric bounds.

* Coincident / Collinear
* Parallel / Perpendicular
* Tangent
* Equal / Symmetric
* Distance / Angle
* Fix / Lock
* Pattern constraints (linear, circular)

**Key:** Agent declares *what must hold*, not *how to solve*.

---

## 4. Reference Geometry (Datum System)

Stable anchors to avoid topological naming issues.

* Datum plane
* Datum axis
* Datum point
* Coordinate frame
* Local reference frame (per feature)

**Analogy:** Type system for geometry.

---

## 5. Feature Operations (Semantic)

Manufacturing-aware transformations.

* Boss / Cut (extrude, revolve)
* Hole (simple, counterbore, countersink; tapped is **future**)
* Fillet (constant; variable is **future**)
* Chamfer
* Shell (**future**)
* Draft (**future**)
* Rib (**future**)
* Groove (**future**)
* Pocket (**future**)

**Important:** Holes ≠ negative cylinders.

---

## 6. Boolean & Composition Abstractions

Explicit part-composition semantics.

* Union (merge bodies)
* Subtract (tool body)
* Intersect
* Keep-separate vs fuse (**future**)
* Boolean groups (transactional)

---

## 7. Patterns & Replication

Intent-preserving repetition.

* Linear pattern
* Circular pattern
* Grid pattern (**future**)
* Pattern-on-curve (**future**)
* Feature pattern vs body pattern (**future**)

---

## 8. Mate & Connector Abstractions (**Future**)

Inspired by Onshape-style mate connectors. Assembly support is placeholder in v1; mates are future.

* Mate connector = {origin, axes, orientation}
* Rigid mate
* Revolute / Slider / Planar
* Fastened
* Offset mate

**Effect:** Reduces constraint dimensionality for agents.

![Image](https://cad.onshape.com/help/Content/Resources/Images/mate-connector-part-pattern.png)

![Image](https://ars.els-cdn.com/content/image/3-s2.0-B978012398513200004X-f04-07ac-9780123985132.jpg)

![Image](https://tecnetinc.com/assembly%20defined%20AID.png)

---

## 9. GD&T / PMI Lowering Outputs (Derived)

Derived annotations generated from FTI constraints (not authoring primitives).

* Size tolerance (±, limits)
* Positional tolerance
* Flatness / Parallelism / Concentricity
* Clearance allowance
* Fit class (press, slip, transition)

**Key Insight:** These are outputs of FTI to GD&T lowering; FTI remains the authoritative intent layer.

---

## 10. Manufacturing Feature Abstractions (**Future**)

Process-aware geometry.

* Machined face
* Drillable hole
* Turned surface
* Additive support region
* Minimum tool radius constraint
* Tool access direction

---

## 11. Material & Physical Properties (Lightweight) (**Future**)

Used to constrain downstream steps.

* Material class
* Density
* Shrink factor
* Surface finish target

---

## 12. Assertions / Topology Guards

Safety rails for agents. These are **validation-only** checks, not authoritative constraints.

* Minimum wall thickness
* Minimum edge length
* Aspect ratio limits
* Self-intersection checks
* Sliver face suppression

---

## 13. Versioned Feature Graph

Explicit dependency model.

* Feature node
* Reference edges
* Suppression / rollback (**future**)
* Replace-with-equivalent (**future**)
* Deterministic rebuild order

---

## 14. Query & Selection Abstractions

Avoid fragile face indexing.

* “Largest planar face normal to +Z”
* “Outer cylindrical surface”
* Semantic tags on faces/features

Selectors that can match multiple candidates must define explicit ranking or ordering rules.

---

## 15. Capability-Driven Abstractions (**Future / optional**)

Design-by-available-process.

* `CanDrill(diameter, depth)`
* `CanMill(radius, depth)`
* `CanPrint(overhang_angle)`

Agents choose geometry that satisfies capabilities, not vice versa.

---

### Layering glossary

* **Sketch constraints**: 2D geometric relations inside sketches/profiles.
* **FTI constraints**: authoritative bounds on allowable geometry.
* **Assertions / topology guards**: validation checks (non-authoritative).

### Summary Principle

**Agents should operate on:**

* Named intent objects
* Stable references
* FTI constraints
* Process-aware features

**Not on:**

* Faces, edges, wires, tolerances-as-text, or solver internals.

If useful, the next step would be to collapse this into a **minimal “agent geometry DSL”** (≈20–30 primitives) and map each abstraction deterministically onto OCCT operations.
