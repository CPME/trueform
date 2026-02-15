# Generators DSL

Generators are authoring-time helpers. They expand into explicit features/sketch
entities before compile and do not appear as their own runtime IR feature kind.

## Generators

- `featureArray(layout, make) -> IntentFeature[]`
- `sketchArray(layout, make) -> SketchEntity[] | SketchProfile[]`
- `featureCircularArray(layout, make) -> IntentFeature[]`
- `sketchCircularArray(layout, make) -> SketchEntity[] | SketchProfile[]`
- `featureRadialArray(layout, make) -> IntentFeature[]`
- `sketchRadialArray(layout, make) -> SketchEntity[] | SketchProfile[]`
- `featureArrayAlongSpline(layout, make) -> IntentFeature[]`
- `sketchArrayAlongSpline(layout, make) -> SketchEntity[] | SketchProfile[]`

Generators expand at authoring time. `count` is a fixed integer tuple `[cols, rows]`, while
`spacing` and `origin` accept `Scalar` values (numbers or expressions). Circular/radial
layouts require numeric angles and radius values because trigonometry is evaluated
immediately.

Examples:
- [Feature array](./examples/generators#feature-array)
- [Sketch array](./examples/generators#sketch-array)
- [Circular array](./examples/generators#circular-array)
- [Radial array](./examples/generators#radial-array)
- [Spline array](./examples/generators#spline-array)
- [Pattern vs generator comparison](./examples/patterns-vs-generators)
