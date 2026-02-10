# Patterns DSL

## Patterns

- `patternLinear(id, origin, spacing, count, deps?) -> PatternLinear`
- `patternCircular(id, origin, axis, count, deps?) -> PatternCircular`

Pattern outputs are currently consumed by `hole(..., { pattern })` for layout; full feature/body patterns are future.
