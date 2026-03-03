# Sketch Dimensioning TrueCAD Plan

Status: integration plan

## Goal

Deliver a CAD-style sketch workbench that feels immediate while delegating
authoritative constraint semantics to TrueForm.

## Product Boundary

- Own pointer interaction, snapping, inferencing, and drag behavior.
- Own dimension glyph placement, witness lines, text editing, and constraint badges.
- Own sketch status coloring (`blue`, `black`, `red`) and selection feedback.
- Do not own a divergent solver or a separate authoritative constraint schema.

## Phases

1. Shared constraint contract adoption
- Replace local placeholder sketch constraint types with the TrueForm-owned schema.
- Serialize the same point refs and constraint ids used by headless builds.

2. Interactive solve loop
- Run the shared solver in a worker on sketch edits.
- Re-solve the active sketch after create, drag, delete, or dimension edits.
- Use temporary cursor constraints during drag so underconstrained geometry follows the pointer.

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

## Integration Rule

- TrueCAD may run the solver locally for responsiveness, but the shared TrueForm
  solver remains the source of truth for buildable geometry.

