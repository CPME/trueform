# Geometry and Sketching DSL

## Geometry: Datums and Sketches

- `datumPlane(id, normal, origin?, deps?) -> DatumPlane`
- `datumAxis(id, direction, origin?, deps?) -> DatumAxis`
- `datumFrame(id, on, deps?) -> DatumFrame`
- `sketch2d(id, profiles, opts?) -> Sketch2D` (opts supports `entities`)

## Geometry: Sketch Primitives

- `sketchLine(id, start, end, opts?) -> SketchLine`
- `sketchArc(id, start, end, center, direction, opts?) -> SketchArc`
- `sketchCircle(id, center, radius, opts?) -> SketchCircle`
- `sketchEllipse(id, center, radiusX, radiusY, opts?) -> SketchEllipse`
- `sketchRectCenter(id, center, width, height, opts?) -> SketchRectangle`
- `sketchRectCorner(id, corner, width, height, opts?) -> SketchRectangle`
- `sketchSlot(id, center, length, width, opts?) -> SketchSlot`
- `sketchPolygon(id, center, radius, sides, opts?) -> SketchPolygon`
- `sketchSpline(id, points, opts?) -> SketchSpline`
- `sketchPoint(id, point, opts?) -> SketchPoint`

Examples:
- [Sketch primitives](./examples/sketches)

## Profiles

- `profileRect(width, height, center?) -> Profile`
- `profileCircle(radius, center?) -> Profile`
- `profilePoly(sides, radius, center?, rotation?) -> Profile`
- `profileSketchLoop(loop, opts?) -> Profile`
- `profileRef(name) -> ProfileRef`
