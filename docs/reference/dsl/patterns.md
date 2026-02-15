# Patterns DSL

## Patterns

- `patternLinear(id, origin, spacing, count, deps?) -> PatternLinear`
- `patternCircular(id, origin, axis, count, deps?) -> PatternCircular`

Feature/body patterning is available by passing `source` and `result`:

- `patternLinear(id, origin, spacing, count, { source, result, deps? }) -> PatternLinear`
- `patternCircular(id, origin, axis, count, { source, result, deps? }) -> PatternCircular`

Without `source`, pattern outputs are consumed by `hole(..., { pattern })` for layout.
