# Topology Selection Stabilization Plan (2026-03-01)

This file records the current stopping point for the semantic topology refactor.

## Goal

Stabilize topological selections so authored references survive normal rebuilds
without relying on kernel traversal ids.

The intended model remains:

- external references stay semantic (`selector.*`, datums, named outputs)
- runtime emits stable TrueForm-owned ids
- backend uses lineage and kernel history internally when available
- ambiguity fails loudly instead of silently guessing

## What Is Done

The practical beta path is in place.

### Stable selection core

- `KernelSelectionRecord` and `KernelSelectionLineage` exist in `src/backend.ts`.
- Stable ids are slot-first when semantics are available, with deterministic
  fallback ids when they are not.
- Aliases are preserved for migration from older hashed ids.

### Selector resolution

- Named selection resolution now does:
  1. exact id match
  2. alias match
  3. conservative semantic rebind for strong stable ids
  4. explicit failure on ambiguity

### Sketch-driven semantic topology

- `extrude` uses prism history to map sketch segments to side faces.
- `revolve` uses generated history to map sketch segments to profile-derived faces.

### Modifier lineage

- `moveFace`, `replaceFace`, `deleteFace`
- `hole`
- `draft`
- `shell`
- `fillet`
- `chamfer`

These now emit lineage-aware stable ids where the backend can justify them.

### Stable descendant edge semantics

Edge modifiers now emit semantic descendant edge families:

- `*.bound.<face-slot>`
- `*.join.<other-modifier-slot>`
- `*.seam`
- `*.end.<n>`
- `*.edge.<n>` as the weakest fallback

This is enough for downstream edge-seeded references to remain meaningful in
normal fillet/chamfer workflows.

### Split lineage

- `splitFace` emits deterministic branch ids with `split` lineage.
- `splitBody` preserves unchanged source faces where possible.

### Point anchors

Stable point references are now implemented in the intended narrow form:

- runtime emits derived point anchors from semantic selections
- `/v1/build` exposes them in `result.selections.points`
- mesh selection metadata exposes them in `selection.meta.pointAnchors`
- authored constraints can round-trip them through:
  - `refPoint(selectorNamed("<selection-id>.point.<locator>"))`

Supported point locators today:

- `center`
- `mid`
- `start`
- `end` (open edges only)

This covers stable vertex-like endpoints on open edges without exposing raw
kernel vertices as a first-class selection kind.

## What Is Not Fully Done

The broad persistent-topology problem is not completely solved yet.

### Booleans are still only partially semantic

Current boolean handling is conservative:

- surviving operand faces can preserve identity
- newly created intersection / cut topology is not yet richly named

This is the biggest remaining gap in stable topology.

### Rebinding is still narrow

Selector rebinding currently recognizes a limited set of semantic transitions
(for example strong modifier edge family changes).

It is not yet a general provenance-driven repair engine over arbitrary lineage.

### Selection records are still lighter than the ideal target

The current record model has:

- `ownerKey`
- `createdBy`
- `role`
- `slot`
- `lineage`
- `aliases`

It does not yet carry the fuller explicit signature payload that would support a
more general repair layer:

- semantic signature
- geometric signature
- confidence class (`semantic`, `derived`, `fallback`)

### Arbitrary vertex exposure is intentionally not implemented

We do not expose every raw topological vertex as a public `point` selection kind.

That remains intentional because:

- many vertices are incidental kernel artifacts
- many meaningful points are not vertices
- raw vertex ids would reintroduce the same instability we just removed

If more point work is needed later, prefer semantic corners/intersections
derived from already-named geometry rather than “all vertices everywhere.”

## Recommended Next Work

Only continue if product needs justify the added complexity.

### Priority 1: Boolean-created topology

Add semantic naming for newly created boolean topology:

- intersection faces
- cut faces
- new boolean-created edges

This is the most valuable remaining work for stable selections.

Current guidance:

- Keep the existing `split.*.branch.*` preserved-face families and
  adjacency-derived edge families as the deterministic compatibility contract for
  the current beta subset.
- Do not treat adjacency-derived naming alone as the final long-term identity
  strategy for booleans.
- The stronger long-term path is: preserve slot families where a source face can
  still justify them, then add explicit provenance/signature metadata for
  boolean-created faces and edges so ids do not depend only on whichever
  neighboring faces happened to survive.
- Initial groundwork for that stronger path is now in place for boolean semantic
  edges: union/intersect edge selections now carry explicit
  `selectionSignature` and `selectionProvenance` metadata alongside the stable
  slot ids.

### Priority 2: Stronger rebinding

Upgrade from pattern-based semantic rebinding to a fuller lineage/signature
repair stage:

- use lineage first
- use semantic signatures second
- use geometric signatures only as guarded fallback
- never silently guess on weak identities

### Priority 3: Semantic corner/intersection anchors

Only if application needs demand it:

- add stable point anchors for clear semantic corners or intersections
- keep them derived from named parent geometry
- do not introduce raw global vertex ids

## Good Stopping Point

The current implementation is a valid stopping point for beta.

It already delivers stable references for:

- mainstream sketch-driven prismatic modeling
- common face modifications
- edge-seeded fillet/chamfer workflows
- split-face branch references
- stable derived point references for constraints

Do not expand further just because the machinery exists. The next worthwhile
investment is booleans; everything after that should be driven by concrete
application needs.
