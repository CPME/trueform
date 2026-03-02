# TrueCAD Integration Handoff (2026-03-02)

Purpose: hand off the current TrueForm semantic-topology state to the TrueCAD
agent so the web app can begin integrating against it in beta.

This document is intentionally scoped to work that primarily belongs in
TrueCAD. It assumes TrueForm is already far enough along to support a beta
integration and that the TrueCAD beta may tolerate breakage while adapting.

## Summary

TrueForm now emits stable semantic face and edge ids for the current beta
surface area of part workflows, including:

- prismatic base topology
- split-face branch topology
- fillet/chamfer semantic edge families
- boolean `subtract` semantic cavity faces and edges
- boolean `union` disambiguated right-side face ids and semantic edges
- boolean `intersect` semantic overlap faces and edges
- conservative selector rebinding for the currently introduced migration cases

This means TrueCAD should stop treating topology references as fragile or
kernel-like and instead adopt TrueForm-emitted selection ids as the primary
selection/persistence contract for supported workflows.

## What TrueCAD Should Assume

- Selection ids emitted by TrueForm are opaque tokens.
- `GET /v1/capabilities.semanticTopology` is the gating signal for whether the
  direct-pick semantic-topology beta contract is available.
- `GET /v1/capabilities.errorContract` is the stable programmatic error-code
  surface for client UX and recovery behavior.
- TrueCAD must persist them exactly as returned.
- TrueCAD must not reconstruct ids from `selectionSlot`, `adjacentFaceSlots`,
  `role`, or other metadata.
- `selectionSlot`, `selectionLineage`, and adjacency metadata are display and
  debugging aids, not an alternative storage contract.
- For the currently supported workflows, stable ids should survive normal
  rebuilds and reasonable upstream edits.
- When TrueForm cannot preserve a reference, the correct product behavior is an
  explicit failure/diagnostic, not silent fallback to a different face/edge.

## TrueCAD Work Items

### 1. Adopt Opaque Semantic Selection IDs End-to-End

- Wherever the web app stores selected topology, persist the emitted
  `selectionId` exactly as returned by TrueForm.
- Remove any client logic that derives references from face order, edge order,
  mesh triangle identity, or ad hoc naming.
- Treat the full string token as canonical, even when it contains readable
  semantic pieces such as `cut.side.1.bound.top`.

### 2. Update Selection/Highlight State Handling

- Ensure click-selection, hover highlight, inspector panels, and downstream
  operations all route through stored semantic ids.
- If the app keeps its own selection model, the model should be keyed by
  `selectionId`, not by mesh-local handles.
- The app may display semantic metadata for UX, but internal selection state
  should still point back to the opaque TrueForm token.

### 3. Update Persistence / Saved Documents

- Persist topology references using the stable semantic ids returned by
  TrueForm.
- If old saved docs contain legacy refs:
  - allow re-open if they already match current supported rebinding paths
  - otherwise surface an explicit migration error to the user
- Do not introduce a second client-side reference format in parallel.

### 4. Add App-Level Round-Trip Tests

Add integration coverage in TrueCAD that proves the app can survive rebuilds
using the actual runtime boundary.

Minimum recommended cases:

- Face workflow:
  - select a boolean `subtract` face (for example `cut.bottom`)
  - persist the returned id
  - change upstream dimensions
  - rebuild
  - verify the app can re-highlight and use the same id in a downstream action

- Face workflow:
  - select a boolean `union` face (for example `right.side.1`)
  - persist the returned id
  - change upstream dimensions while preserving the same semantic face
  - rebuild
  - verify the same id still resolves

- Edge workflow:
  - select a boolean `union` edge (for example `right.side.1.bound.top`)
  - persist the returned id
  - change upstream dimensions while preserving the same semantic edge
  - rebuild
  - verify the same id still resolves and can still drive an edge feature

- Edge workflow:
  - select a fillet/chamfer semantic edge family id
  - verify the app can preserve and reuse it across rebuilds

### 5. Add Failure UX for Unresolved IDs

- If TrueForm returns one of the published selector failure codes, surface that
  explicitly in the UI.
- At minimum, handle:
  - `selector_named_missing`
  - `selector_ambiguous`
  - `selector_empty`
  - `selector_empty_after_rank`
  - `selector_legacy_numeric_unsupported`
- Do not silently map the operation to a different selection.
- The UI should show which stored id failed and which feature/action depends on
  it.

### 6. Keep the Mesh Layer Secondary

- Continue using meshes for display and hit testing.
- Do not elevate mesh-local identifiers into the persisted modeling contract.
- When a mesh hit occurs, map it back to the semantic selection id returned by
  TrueForm and store that semantic id.

### 7. Feature-Flag the Integration

Recommended beta rollout:

- Put semantic-topology-backed persistence behind a feature flag if the app can
  support both old and new flows temporarily.
- Limit first rollout to part editing workflows that match the currently tested
  TrueForm scope.
- Expand only after the app-level rebuild round-trip tests are stable.

## Suggested First Implementation Slice in TrueCAD

Build the thinnest useful vertical path:

1. Call TrueForm build.
2. Select a face in the viewer.
3. Capture the returned `selectionId`.
4. Persist it in local app state.
5. Trigger an upstream edit + rebuild.
6. Ask TrueForm to resolve/use the same `selectionId`.
7. Re-highlight the selection and apply one downstream operation.

Do this first for a boolean-derived face before broadening to edges.

## Supported Beta Contract to Target

TrueCAD should target the currently documented TrueForm contract in:

- `specs/runtime-contract.md`
- `specs/semantic-topology-beta-scope-2026-03-02.md`
- `specs/semantic-topology-runtime-fixtures-2026-03-02.md`
- `docs/reference/dsl/selectors.md`

At runtime, gate the beta flow on:

- `GET /v1/capabilities.semanticTopology.enabled === true`
- `GET /v1/capabilities.semanticTopology.contractVersion === "beta-2026-03-02"`

Relevant examples already supported by TrueForm include:

- `face:body.main~subtract-1.cut.bottom`
- `face:body.main~union-1.right.side.1`
- `face:body.main~intersect-1.side.1`
- `edge:body.main~union-1.right.side.1.bound.top`
- `edge:body.main~intersect-1.side.1.bound.top`
- `edge:body.main~subtract-1.cut.bottom.join.cut.side.1`

## Known Limits (Do Not Over-Assume)

- The current rebinding layer is conservative and explicit, not a general
  provenance engine.
- Not every possible topology-changing operation is semantically named yet.
- If a workflow falls outside the currently covered cases, ids may still fall
  back to deterministic hashed forms.
- TrueCAD should not assume arbitrary old ids can always be repaired.

## Acceptance Criteria for TrueCAD Beta Integration

Treat the integration as good enough for beta when:

- The app persists emitted semantic selection ids as opaque tokens.
- The app can re-highlight stored ids after rebuild for at least one boolean
  face case and one boolean edge case.
- A downstream edit operation can consume a previously stored semantic id after
  an upstream rebuild.
- Unresolved ids produce explicit UI-visible diagnostics.
- The app does not synthesize topology ids from client-side metadata.

## Notes for the TrueCAD Agent

- Prefer adapting the app to the current TrueForm contract rather than asking
  TrueForm to add a parallel client-specific reference scheme.
- If the app reveals an actual runtime-payload mismatch, document the mismatch
  precisely and request a TrueForm-side fix against the existing semantic-id
  contract.
- Do not block the beta integration on a future full provenance/signature
  repair engine; the current contract is sufficient to start integrating now.
