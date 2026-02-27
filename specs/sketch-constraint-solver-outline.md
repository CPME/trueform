# Sketch Constraint Solver Outline

Status: proposed implementation outline. This is not current behavior.

## Recommendation

Yes, TrueForm should add a sketch constraint solver, but only as a narrow,
deterministic authoring-time layer.

The right first step is not a full CAD-style sketch environment. It is a solver
that:

- accepts declarative 2D relations on sketch entities
- resolves them before backend execution
- emits explicit sketch geometry into the existing build pipeline
- fails deterministically when the sketch is underconstrained, overconstrained,
  or unsatisfied

This preserves the current system boundary: the backend still consumes explicit
coordinates, loops, and profiles rather than solver state.

## Why Add It

Current `Sketch2D` is procedural. That is enough for explicit geometry, but it
forces agents to hand-author coordinates for shapes that are better described by
relations.

A constrained sketch layer would improve:

- authoring ergonomics for agents and humans
- robustness when dimensions change
- semantic positioning for features like holes and pockets
- future compatibility with parametric editing without leaking kernel details

## Non-Goals For V1

Do not build a full interactive sketch workbench in the first pass.

Do not:

- persist solved constraint state in the build result
- couple solving to OCCT or browser B-Rep objects
- add implicit loop finding
- support every classical CAD relation at once
- allow ambiguous sketches to silently choose arbitrary solutions

## Architectural Position

The solver should live in the authoring and normalization layer, not the OCCT
backend.

Recommended flow:

1. DSL authors define sketch entities plus sketch constraints.
2. Normalization resolves expressions and runs the sketch solver.
3. The solver emits solved `SketchEntity[]` with concrete coordinates.
4. Existing validation checks loops and profiles.
5. Backend execution remains unchanged.

This keeps sketch constraints separate from FTI constraints and aligns with the
existing direction that sketch relations are not authoritative manufacturing
constraints.

## Proposed Surface Area

### 1. Authoring-only sketch constraint model

Add a pre-IR shape for constrained sketches. Two viable ways to stage it:

- Add a new authoring helper like `constrainedSketch2d(...)` that lowers to
  `feature.sketch2d`.
- Extend `sketch2d(...)` options with a `constraints` field, then strip it
  during normalization before final IR emission.

For the first release, the second option is lower-friction if the field is
treated as authoring-time only and does not survive normalized output.

### 2. Constraint primitives

Start with a minimal set that unlocks most practical sketches:

- `coincident(point, point)`
- `horizontal(line)`
- `vertical(line)`
- `parallel(line, line)`
- `perpendicular(line, line)`
- `equalLength(line, line)`
- `distance(pointOrLine, pointOrLine, value)`
- `angle(line, line, value)`
- `radius(circleOrArc, value)`
- `fixPoint(point, x?, y?)`

Defer until later:

- tangent
- symmetry
- concentric
- pattern constraints
- spline-specific constraints

### 3. Reference model

Constraints should target stable sketch-local references, not array indexes.

Use references like:

- entity endpoints (`line-1.start`, `line-1.end`)
- entity centers (`circle-1.center`)
- whole entities (`line-1`, `arc-1`)

This mirrors the rest of TrueForm's preference for stable names over positional
references.

## Solver Strategy

Use a deterministic numerical solver over 2D parameters.

### Variables

Represent each sketch entity by a minimal parameter set:

- line: two endpoints
- circle: center + radius
- arc: center + start + end or center + radius + angles
- rectangle helper: lower to primitive lines before solving

### Constraints as residuals

Each constraint becomes one or more scalar residual equations.

Examples:

- coincident: delta x, delta y
- horizontal: delta y
- equal length: length difference
- angle: angle difference

### Solution method

Start with damped least-squares (Levenberg-Marquardt or Gauss-Newton with
damping), with:

- deterministic variable ordering
- deterministic iteration limits
- convergence thresholds tied to document tolerance

### DOF analysis

Before solving, estimate degrees of freedom to catch clearly invalid sketches:

- unconstrained: reject if free rigid-body motion or unresolved shape DoF remain
- overconstrained: reject when redundant or conflicting constraints cannot be
  satisfied

Do not rely on the numerical solver alone for diagnostics.

## Determinism Rules

The solver must not introduce "looks solved" behavior that varies by run.

Rules:

- stable variable ordering by entity id, then sub-handle
- stable constraint ordering by declaration order
- no random initialization
- explicit fallback seed rules
- explicit mirror-choice rules when multiple solutions exist

If multiple valid solutions remain, fail with a diagnostic unless the sketch has
enough anchors to disambiguate orientation and placement.

## Validation Behavior

Add a sketch-constraint validation pass before existing profile validation.

Required checks:

- all referenced entities and handles exist
- referenced entity kinds are compatible with the constraint
- constrained entities belong to the same sketch
- required anchor constraints are present
- solved geometry respects all constraint tolerances

Diagnostics should be structured and actionable:

- `sketch_constraint_reference_missing`
- `sketch_constraint_kind_mismatch`
- `sketch_underconstrained`
- `sketch_overconstrained`
- `sketch_unsatisfied`
- `sketch_ambiguous_solution`

## Compiler Integration

Recommended implementation slices:

1. Add authoring types and builders in `src/dsl.ts` and `src/dsl/geometry.ts`.
2. Add authoring-only constraint types near sketch types in `src/ir.ts` or in a
   separate authoring module if we want to keep normalized IR strict.
3. Extend normalization to:
   - evaluate scalar expressions
   - expand helper entities
   - solve sketch constraints
   - emit solved `SketchEntity[]`
4. Extend validation to verify solved geometry and constraint references.
5. Keep backend OCCT feature execution unchanged initially.

## Suggested Rollout

### Phase 1: Fixed-point constrained lines

Support only lines with:

- coincident
- horizontal
- vertical
- parallel
- perpendicular
- equal length
- distance
- fix point

This already covers many plates, tabs, pockets, and simple mechanical layouts.

### Phase 2: Circles and arcs

Add:

- radius
- center coincidence
- circle/arc distance
- line-line angle

This unlocks hole-center layout and many round-profile cases.

### Phase 3: Ambition only after proof

Consider:

- tangent
- symmetry
- concentric
- pattern constraints
- spline constraints

Only add these after the simpler set has stable diagnostics and predictable
runtime.

## Test Plan

Each constraint family should get targeted e2e tests. Do not hide the solver
behind broad fixture tests.

Minimum test matrix:

- solves a rectangle from relational constraints
- updates solved geometry when one dimension changes
- rejects underconstrained sketches
- rejects conflicting constraints
- rejects ambiguous mirror solutions
- preserves deterministic output across repeated runs
- extrudes solved `profile.sketch` output into valid solids

Add probe coverage for:

- vertex count and loop closure stability
- runtime budget on representative sketches

## Performance Guardrails

Keep the feature practical for webapp use.

- Solve only the changed sketch during incremental rebuilds.
- Cache solved sketches by normalized constraint signature.
- Cap entity count for V1 and return a clear error above the cap.
- Keep solving independent of meshing and backend execution.
- Avoid synchronous cross-process calls for solving.

The solver should be pure TypeScript so it works in Node and browser workers.

## Risks

Primary risks:

- ambiguous solutions creating non-deterministic geometry
- over-scoping into a full CAD solver too early
- weak diagnostics that make agent-generated sketches hard to debug
- introducing hidden backend differences if solving depends on OCCT

The narrow-scope authoring-time design reduces all four.

## File Touchpoints

Likely files to touch for an implementation:

- `src/dsl.ts`
- `src/dsl/geometry.ts`
- `src/ir.ts`
- `src/compiler.ts`
- `src/ir_normalize.ts`
- `src/ir_validate.ts`
- `src/tests/occt.sketch*.e2e.test.ts`
- `docs/reference/dsl/geometry.md`
- `specs/spec.md`

## Promotion Criteria

Do not treat this as complete until it has:

- targeted solver tests
- deterministic failure diagnostics
- example docs showing at least one constrained sketch
- visual signoff artifacts for a geometry example that depends on solving

The first shipped version should be intentionally small and reliable rather than
trying to match a full parametric CAD constraint system.
