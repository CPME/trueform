# Patterns vs Generators

Both create repeated geometry, but they operate at different stages.

## At a Glance

| Topic | Pattern | Generator |
| --- | --- | --- |
| Stage | Runtime/build graph | Authoring/code expansion |
| IR artifact | `pattern.linear` / `pattern.circular` node | Expanded concrete features only |
| Best for | Parametric intent in model history | Reusable code templates and loops |
| Typical use | Hole arrays, feature/body replication intent | Programmatic creation of many similar features |

## Pattern Example

![Pattern example](/examples/dsl/pattern.iso.png)

```ts
const examplePart = part("example-pattern", [
  extrude("seed", profileRect(10, 10), 8, "body:seed"),
  patternLinear(
    "pattern-1",
    selectorFace([predCreatedBy("seed"), predPlanar(), predNormal("+Z")], [rankMaxZ()]),
    [18, 0],
    [4, 1],
    {
      source: selectorNamed("body:seed"),
      result: "body:main",
      deps: ["seed"],
    }
  ),
]);
```

## Generator Example

![Feature array example](/examples/dsl/feature-array.iso.png)

```ts
const cubes = featureArray(
  { count: [3, 2], spacing: [36, 36], origin: [-36, -18, 6] },
  ({ index, offset }) =>
    extrude(
      `cube-${index}`,
      profileRect(16, 16, offset),
      8,
      `body:cube-${index}`
    )
);
```

Use patterns when you want replicated model intent managed by the kernel graph.
Use generators when you want concise code that expands to explicit features.
