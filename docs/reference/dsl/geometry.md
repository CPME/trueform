# Geometry and Sketching DSL

This module is the broad surface that includes sketching, selectors, paths, and features.
For intent-first imports, prefer:

- `trueform/dsl/sketch` for sketching/profiles/path builders
- `trueform/dsl/features` for feature operations
- `trueform/dsl/selectors` for selector/query helpers

## Geometry: Datums and Sketches

- `datumPlane(id, normal, origin?, deps?, opts?) -> DatumPlane` (`opts.xAxis` supported)
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

## Paths and Axis/Plane Helpers

- `pathPolyline(points, opts?) -> Path3D`
- `pathSpline(points, opts?) -> Path3D`
- `pathSegments(segments) -> Path3D`
- `pathLine(start, end) -> PathSegment`
- `pathArc(start, end, center, direction?) -> PathSegment`
- `axisVector(direction) -> AxisSpec`
- `axisDatum(ref) -> AxisSpec`
- `axisSketchNormal() -> ExtrudeAxis`
- `planeDatum(ref) -> PlaneRef`
