# Features DSL

## Features

- `extrude(id, profile, depth, result?, deps?, opts?) -> Extrude`
- `surface(id, profile, result?, deps?) -> Surface`
- `revolve(id, profile, axis, angle, result?, opts?) -> Revolve`
- `loft(id, profiles, result?, deps?, opts?) -> Loft`
- `sweep(id, profile, path, result?, deps?, opts?) -> Sweep`
- `shell(id, source, thickness, result?, deps?, opts?) -> Shell`
- `mirror(id, source, plane, result?, deps?) -> Mirror`
- `thicken(id, surface, thickness, result?, deps?, opts?) -> Thicken`
- `thread(id, axis, length, majorDiameter, pitch, result?, deps?, opts?) -> Thread` (modelled)
- `hole(id, onFace, axis, diameter, depth, opts?) -> Hole`
- `fillet(id, edges, radius, deps?) -> Fillet`
- `chamfer(id, edges, distance, deps?) -> Chamfer`
- `booleanOp(id, op, left, right, result?, deps?) -> BooleanOp`

Examples:
- [Extrude](./examples/features#extrude)
- [Surface](./examples/features#surface)
- [Revolve](./examples/features#revolve)
- [Loft](./examples/features#loft)
- [Sweep](./examples/features#sweep)
- [Shell](./examples/features#shell)
- [Mirror](./examples/features#mirror)
- [Thicken](./examples/features#thicken)
- [Modelled thread](./examples/features#modelled-thread)
- [Hole](./examples/features#hole)
- [Fillet](./examples/features#fillet)
- [Chamfer](./examples/features#chamfer)
- [Boolean](./examples/features#boolean-union)

## Thread

Defaults use an ISO-style profile (60 deg flank angle with crest/root flats derived
from pitch and minor diameter). Override `profileAngle`, `crestFlat`, or
`rootFlat` to customize the profile.

Options (`opts`):
- `origin?: Point3D`
- `minorDiameter?: Scalar`
- `handedness?: "right" | "left"`
- `segmentsPerTurn?: Scalar`
- `profileAngle?: Scalar` (radians)
- `crestFlat?: Scalar`
- `rootFlat?: Scalar`
