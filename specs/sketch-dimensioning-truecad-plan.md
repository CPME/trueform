# Sketch Dimensioning TrueCAD Plan

Status: active integration plan
Updated: 2026-03-13
Owner: TrueCAD sketch UX

Purpose: define the TrueCAD-owned adoption work on top of the shared TrueForm
sketch solver.

Related:
- `specs/sketch-webapp-runtime-contract.md` - solver/runtime interaction contract
- `specs/sketch-solver-truecad-backlog.md` - remaining shared-solver work
- `specs/archive/sketch-dimensioning-trueform-plan.md` - completed TrueForm-side
  implementation plan

## Ownership Boundary

TrueCAD owns:

- pointer interaction, snapping, inferencing, and drag behavior
- dimension glyph placement, witness lines, text editing, and constraint badges
- sketch status coloring (`blue`, `black`, `red`) and selection feedback
- worker orchestration and preview-state presentation

TrueCAD does not own:

- a divergent solver
- a separate authoritative constraint schema
- canonical buildable geometry semantics

## Active Integration Phases

1. Shared constraint contract adoption
- Replace local placeholder sketch-constraint types with the TrueForm-owned
  schema.
- Serialize the same point refs, constraint ids, and solver-visible metadata
  used by headless builds.

2. Interactive solve loop
- Run the shared solver in a worker on sketch edits.
- Re-solve the active sketch after create, drag, delete, or dimension edits.
- Use temporary cursor constraints during drag so underconstrained geometry
  follows the pointer.
- Match preview and commit behavior to
  `specs/sketch-webapp-runtime-contract.md`.

3. Visual workbench
- Render constraint glyphs near referenced geometry.
- Render editable dimension annotations with stable layout anchors.
- Show entity status:
  - black: zero remaining DOF
  - blue: still movable
  - red: conflicting or unsatisfied

4. Authoring ergonomics
- Auto-add inferred constraints for common gestures.
- Support click-to-dimension and in-place numeric editing.
- Surface solver diagnostics inline instead of failing silently.

## Exit Criteria

- The shared TrueForm schema is the only authoritative sketch-constraint model
  used by TrueCAD.
- Worker-driven preview solves and pointer-up commit solves follow the frozen
  runtime contract.
- TrueCAD UI consumes shared solver diagnostics directly rather than inventing a
  parallel status model.

## Integration Rule

TrueCAD may run the solver locally for responsiveness, but the shared TrueForm
solver remains the source of truth for buildable geometry.
