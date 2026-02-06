# TODOs

## Dependency Graph Hardening (Hybrid Inference)

Goal: remove authoring footguns, keep deterministic planning, and support agent-scale maintainability. Current graph is explicit-only via `feature.deps` (`src/graph.ts`). Build order matters because selectors resolve against upstream results only (`src/executor.ts`). The spec calls for a DAG plan stage (`aidocs/spec.md`), so we need hybrid inference now.

1. Inventory reference sources in the IR and define inference rules.
Details: Use `src/dsl.ts` and `src/compiler.ts` to identify fields that reference other features. For v1, infer dependencies from these concrete anchors only: `profile.ref` (profile name defined in `feature.sketch2d`), `pattern.ref` (pattern feature ID), `selector.named` (named output string), `pred.createdBy(featureId)` (explicit feature ID), `rank.closestTo(target)` (recurse into target selector). Do not infer from generic predicates like `pred.planar` or rank rules like `rank.maxArea` because they are ambiguous without an anchor.

2. Implement inference in `buildDependencyGraph` (`src/graph.ts`).
Details: Build feature indexes up front. Keep a `byId` map of all features. Build a `profileName -> featureId` map from `feature.sketch2d.profiles[].name`. Build a `outputName -> featureId` map from features that declare a `result` name (`feature.extrude`, `feature.revolve`, `feature.boolean`). When walking each feature, derive a set of inferred deps from anchors and union it with explicit `feature.deps`. Explicit deps never remove inferred deps. All deps must reference existing features or raise an error.

3. Add a selector dependency extractor.
Details: Create a helper in `src/graph.ts` or a small new module that walks a selector tree and returns anchor requirements. For `selector.named`, resolve via `outputName -> featureId`. For predicates, only `pred.createdBy` yields a dep. For `rank.closestTo`, recursively extract deps from the nested selector. If the selector has no anchors and the feature has no explicit `deps`, treat that as a compile error to avoid silent ambiguity.

4. Add compile-time validation errors with explicit `CompileError` codes.
Details: Add new codes to `CompileError` usage in `src/graph.ts` (or a shared errors module if introduced). Required cases: unknown feature ID in explicit deps, duplicate profile name, missing profile name for `profile.ref`, missing pattern feature for `pattern.ref`, duplicate output name, missing output producer for `selector.named`, unknown feature ID for `pred.createdBy`, and selector without anchors and without explicit deps. Make error messages precise and include the feature ID and the missing reference.

5. Update `compilePartWithHashes` and any other graph consumers to use the new inferred graph consistently.
Details: Ensure `compilePartWithHashes` uses the same `buildDependencyGraph` logic so order and hashes line up with actual execution order. If additional graph consumers exist later, they must use the same inference, not a custom graph builder.

6. Add tests that encode the new contract.
Details: Add or extend tests under `src/tests/`. Keep tests small and deterministic. Required cases: `profile.ref` inference orders sketch before extrude with no explicit deps; `selector.named` inference orders producer before consumer; `pred.createdBy` inference orders correctly and errors if the ID is missing; duplicate profile names and duplicate output names fail deterministically; selector with no anchors and no explicit deps raises a compile error; explicit deps still allowed and merged.

7. Update docs in `aidocs/spec.md`.
Details: Add a short note in the “Plan” section stating that dependency planning is hybrid (explicit + inferred), anchors are required for selector-only deps, and missing anchors are compile errors. Mention that generic selectors must use explicit deps to avoid ambiguous planning.

## Viewer + OCCT Follow-ups

Context: Viewer edge rendering originally showed triangulation-derived face boundaries; fillet/tangent edges on the main rectangular body appeared missing. Switching to B-Rep edge sampling (now default `?edges=brep`) removed the triangle “starburst,” but hidden/back-side edges are still visible because `depthTest = false` on the line material. Also, post-boolean face splitting uses `BOPAlgo_Splitter` to preserve face boundaries, which increases edge/face counts but leaves the result as a compound with multiple solids (debug export currently reports `solids: 7`). See viewer screenshots from Feb 2026: first image shows triangle starburst; second image shows corrected B-Rep edges but hidden lines visible through the body.

1. Viewer: add a `?hidden=1` toggle (or similar) and default to visible-only edges (enable depth test), with polygon offset to reduce z-fighting.
Details: Find the line material setup in the viewer (`tools/viewer/` code) and default `depthTest = true`. Provide a query param to show hidden lines by turning depth test off. Add polygon offset to keep edges visible without heavy z-fighting when depth testing is on.
2. OCCT post-boolean splitting: reconcile multi-solid outputs after `BOPAlgo_Splitter` (select largest by volume or re-solidify) so debug exports don’t report `solids > 1` and downstream selection is stable.
Details: In the OCCT backend (`src/backend_occt.ts`), identify the splitter post-step and normalize the output to a single solid. Strategy options are to pick the largest solid by volume or to re-sew into a single solid if possible. Whatever is chosen must be deterministic and stable across rebuilds.
