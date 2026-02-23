# TODOs

- [x] Add deterministic fallback ordering for ambiguous selectors
Detail: Resolver now breaks ties by area → centerZ → centerY → centerX → id, so ambiguous selections resolve consistently without manual ranks.
