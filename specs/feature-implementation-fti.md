# Feature Implementation: FTI MVP (Surface Profile Only)

Status: planning only (no code changes yet)

## Scope (MVP)
- Add Functional Tolerancing Intent (FTI) as first-class IR data.
- Only supported constraint primitive: **profile of a surface**.
- Output only: **surface profile PMI** as a semantic JSON artifact (no STEP/QIF export yet).
- No geometric conformance evaluation in MVP (data-only intent + output).

## Why This Scope
- Aligns with the FTI spec principle: GD&T/PMI are compiled artifacts.
- Surface profile is the lowest common denominator that can conservatively cover many geometric requirements.
- Keeps the MVP compatible with browser runtimes (OpenCascade.js / wasm), without heavy analysis APIs.

## Current Readiness (What Exists)
- Intent IR and DSL types exist, but `constraints` are `unknown[]` placeholders.
- Validation covers features/params/assemblies; constraints are ignored with warnings.
- Compile/build pipeline already normalizes and executes features deterministically.
- Selector system exists and provides stable geometry references (required for constraints).

## Blocking Gaps
1. **Typed FTI schema is missing.**
   - `IntentDocument.constraints` and `IntentPart.constraints` are `unknown[]`.
2. **Constraints are ignored.**
   - Compiler warns but does not validate/normalize/emit FTI.
3. **No requirement/capability types or links.**
4. **No PMI artifact output path.**
5. **No tests for constraints or PMI.**

## MVP Plan (No Conformance Evaluation)

### 1) Define FTI Types (IR)
- Add FTI schema types to `src/dsl.ts`:
  - `GeometryRef` (at least `RefSurface` + optional `RefFrame`).
  - `Requirement` (id, text).
  - `CapabilitySet` (id, kind, optional ranges).
  - `SurfaceProfileConstraint` with:
    - `id`, `kind: "constraint.surfaceProfile"`
    - `target: RefSurface`
    - `tolerance: number` (length units)
    - optional `referenceFrame?: RefFrame`
    - `capabilities?: ID[]`
    - `requirement?: ID`
- Replace `unknown[]` with `FTIConstraint[]` where appropriate.

### 2) DSL Helpers
- Add builders to `src/dsl.ts`:
  - `refSurface(selector: Selector)`
  - `refFrame(selector: Selector)`
  - `requirement(id, text)`
  - `capabilitySet(id, kind, opts?)`
  - `surfaceProfileConstraint(id, target, tolerance, opts?)`

### 3) Validation (Structural)
- Extend `src/validate.ts` to:
  - Validate constraint schema correctness.
  - Check positive tolerance values.
  - Check referenced requirements/capabilities exist (if provided).
  - Ensure constraint target selector is well-formed.
- Do **not** evaluate geometry; only validate structure.

### 4) Normalization
- Normalize tolerance scalar to length units in `src/compiler.ts`.
- Normalize any embedded selectors via existing selector normalization.

### 5) PMI Output Artifact
- Add PMI emitter step after compile/build (or a utility function):
  - Output JSON array of semantic PMI characteristics.
  - Only emit `profile_of_surface` characteristics.
  - Include links to constraint id, requirement id, capability set.
- Store as build artifact (e.g., in build results or viewer export path later).

### 6) Tests
- Add tests for:
  - DSL builders produce typed constraints.
  - Validation errors for missing/invalid fields.
  - Normalization of tolerance.
  - PMI artifact shape and traceability fields.

## Comparison to aidocs
Aligned with:
- FTI is part of the unified IR.
- Constraints are authoritative; PMI is derived output.
- Stable geometry references via selectors/datums.
- Conservative lowering with profile tolerances.

Deliberate MVP reductions:
- Only **surface profile** constraint (no size/pose/distance/angle/clearance).
- No conformance evaluation or capability reasoning beyond validation.
- PMI output is JSON only (no STEP/QIF export in MVP).

## Risks / Follow-ons
- Without geometry evaluation, constraints are authoritative but unverifiable.
- A future backend measurement API is needed for real profile-of-surface checks.
- Viewer annotations are optional but can help demonstrate PMI output.

## Recommendation
Proceed with this MVP if the goal is to establish intent → PMI output and a typed FTI schema.
If the goal is **verifiable tolerancing**, prioritize backend measurement APIs first.
