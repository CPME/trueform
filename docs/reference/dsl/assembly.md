# Assembly DSL

Assembly data is modeled in the DSL and IR, but core compile remains part-centric in v1.
`buildAssembly` / `solveAssembly` are currently utility APIs and are treated as
experimental rather than part of the deterministic part compile pipeline.

Current Step 1 contract direction:
- Mate connectors are authored on parts.
- Assembly intent is stored in a separate assembly file/document.
- This data model can move forward before full assembly solver maturity, but it
  depends on stable part-level connector and semantic-reference behavior.

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

## Experimental Solver Helpers

Import from:

```ts
import { buildAssembly, solveAssembly } from "trueform/experimental";
```

- `buildAssembly(assembly, parts, options?) -> AssemblySolveResult`
- `solveAssembly(assembly, partConnectors, options?) -> AssemblySolveResult`

Solver maturity note:
- Assembly authoring/data contracts are safer to build out now than broad solver
  guarantees.
- Treat solver output as experimental until the required part-level semantic
  topology and connector behavior is stable for the target workflows.

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
