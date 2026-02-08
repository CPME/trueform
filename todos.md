# TODOs

- [x] Add deterministic fallback ordering for ambiguous selectors
Detail: Resolver now breaks ties by area → centerZ → centerY → centerX → id, so ambiguous selections resolve consistently without manual ranks.

- [ ] Investigate selector ambiguity root causes in OCCT metadata
Detail: Add a small diagnostic helper to log selector predicates + candidate counts (and include in error messages) so we can see exactly why a selector is empty or ambiguous.

- [ ] Make mate connector selectors more robust by default
Detail: Add a helper that builds a connector selector using `predCreatedBy` + `predPlanar` + a rank (`rankMaxZ`/`rankMinZ`/`rankMaxArea`) to avoid ambiguous face matches, and document when to use each.

- [ ] Improve selector error surfacing during viewer export
Detail: Catch selector errors in `tools/viewer/export.mjs` and rethrow with part id + connector id so a failing part doesn’t halt the whole export without context.
