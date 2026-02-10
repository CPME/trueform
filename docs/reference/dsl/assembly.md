# Assembly DSL

Assembly data remains the authoritative source, but `buildAssembly` / `solveAssembly`
can solve basic mates for now (fixed, coaxial, planar, distance, angle, parallel,
perpendicular, insert, slider, hinge).

## Assembly (Data-Only in v1)

- `assembly(id, instances, opts?) -> IntentAssembly`
- `instance(id, part, transform?, tags?) -> AssemblyInstance`
- `transform(opts?) -> Transform`
- `ref(instance, connector) -> AssemblyRef`
- `mateFixed(a, b) -> AssemblyMate`
- `mateCoaxial(a, b) -> AssemblyMate`
- `matePlanar(a, b, offset?) -> AssemblyMate`
- `mateDistance(a, b, distance?) -> AssemblyMate`
- `mateAngle(a, b, angle?) -> AssemblyMate`
- `mateParallel(a, b) -> AssemblyMate`
- `matePerpendicular(a, b) -> AssemblyMate`
- `mateInsert(a, b, offset?) -> AssemblyMate`
- `mateSlider(a, b) -> AssemblyMate`
- `mateHinge(a, b, offset?) -> AssemblyMate`
- `output(name, refs) -> AssemblyOutput`
- `connector(id, origin, opts?) -> MateConnector`

## Mate DOF

The solver treats the first instance as fixed. Degrees of freedom (DOF) below
are for the remaining instance.

| Mate | Expected DOF | Allowed motion (intuitive) |
| --- | --- | --- |
| `mate.fixed` | 0 | None |
| `mate.insert` | 1 | Rotation about connector Z |
| `mate.hinge` | 1 | Rotation about connector Z |
| `mate.slider` | 1 | Translation along connector Z |
| `mate.coaxial` | 2 | Translate along Z, rotate about Z |
| `mate.planar` | 3 | Translate in plane, rotate about Z |
| `mate.parallel` | 4 | Any translation, rotate about Z |
| `mate.distance` | 5 | Any motion preserving origin distance |
| `mate.angle` | 5 | Any motion preserving axis angle |
| `mate.perpendicular` | 5 | Any motion keeping axes perpendicular |

Examples:
- [Basic assembly](./examples/assembly#basic-assembly)
