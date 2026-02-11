# TODOs

- [x] Add deterministic fallback ordering for ambiguous selectors
Detail: Resolver now breaks ties by area → centerZ → centerY → centerX → id, so ambiguous selections resolve consistently without manual ranks.

- [ ] Investigate selector ambiguity root causes in OCCT metadata
Detail: Add a small diagnostic helper to log selector predicates + candidate counts (and include in error messages) so we can see exactly why a selector is empty or ambiguous.

- [ ] Make mate connector selectors more robust by default
Detail: Add a helper that builds a connector selector using `predCreatedBy` + `predPlanar` + a rank (`rankMaxZ`/`rankMinZ`/`rankMaxArea`) to avoid ambiguous face matches, and document when to use each.

- [ ] Improve selector error surfacing during viewer export
Detail: Catch selector errors in `tools/viewer/export.mjs` and rethrow with part id + connector id so a failing part doesn’t halt the whole export without context.

- [ ] Fix modelled thread geometry (docs image still reads as a helical ribbon, not a thread)
Detail: Current `thread` example shows a thin spiral flange / band, with missing thread root/crest definition and a top face that looks like a spiral cutout. Investigate sweep profile orientation and intersection with the core so the result looks like a proper thread ridge wrapped around a cylinder (continuous triangular/trapezoidal tooth).

- [ ] Make thicken source face opaque in docs rendering
Detail: The face used for thicken should render opaque on top of the translucent solid so the source surface is clearly readable.
