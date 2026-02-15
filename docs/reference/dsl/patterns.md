# Patterns DSL

Patterns are kernel-level replication intent in the IR. They are resolved by the
backend during build and stay parametric in the feature graph.

## Patterns

- `patternLinear(id, origin, spacing, count, deps?) -> PatternLinear`
- `patternCircular(id, origin, axis, count, deps?) -> PatternCircular`

Feature/body patterning is available by passing `source` and `result`:

- `patternLinear(id, origin, spacing, count, { source, result, deps? }) -> PatternLinear`
- `patternCircular(id, origin, axis, count, { source, result, deps? }) -> PatternCircular`

Without `source`, pattern outputs are consumed by `hole(..., { pattern })` for layout.

## Pattern vs Generator

- Pattern: runtime feature intent in IR (`pattern.linear`, `pattern.circular`), stays editable in rebuilds.
- Generator: authoring-time code helper that expands to many features before compile.

Use a pattern when you want one replicated intent in the model graph. Use a
generator when you want code reuse/macros that produce explicit repeated features.

Examples:
- [Pattern layout / feature pattern](./examples/features#pattern-featurebody)
- [Pattern vs generator comparison](./examples/patterns-vs-generators)
