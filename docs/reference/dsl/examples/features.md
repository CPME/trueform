# Feature Examples

The examples below are rendered from OpenCascade.js output via
`npm run docs:examples`.

## Extrude

![Extrude example](/examples/dsl/extrude.iso.png)

```ts
const examplePart = part("example-extrude", [
  extrude("base", profileRect(80, 50), 12, "body:main"),
]);
```

Notes:
- Default output is `body:*` (mode `solid`).
- Use `extrude(..., { mode: "surface" })` to extrude a wire/profile into a surface output (`kind: "face"`).

## Surface

```ts
const rect = sketchRectCorner("rect-1", [0, 0], 40, 20);
const sketch = sketch2d(
  "sketch-face",
  [{ name: "profile:rect", profile: profileSketchLoop(["rect-1"]) }],
  { entities: [rect] }
);

const examplePart = part("example-surface", [
  sketch,
  surface("face-1", profileRef("profile:rect"), "surface:main"),
]);
```

## Revolve

![Revolve example](/examples/dsl/revolve.iso.png)

```ts
const examplePart = part("example-revolve", [
  revolve(
    "ring-revolve",
    profileRect(3, 6, [1.5, 3, 0]),
    "+X",
    "full",
    "body:main"
  ),
]);
```

Notes:
- Use `revolve(..., { mode: "surface" })` to revolve a wire/profile into a surface output (`kind: "face"`).

## Loft

![Loft example](/examples/dsl/loft.iso.png)

```ts
const examplePart = part("example-loft", [
  loft(
    "loft-1",
    [
      profileCircle(10, [0, 0, 0]),
      profilePoly(6, 16, [0, 0, 24], Math.PI / 6),
    ],
    "body:main"
  ),
]);
```

Notes:
- Loft supports 2+ profiles.
- If either profile is an open sketch (e.g., `profileSketchLoop(..., { open: true })`),
  the loft outputs a surface (kind `face`) instead of a solid.
- Use `loft(..., { mode: "surface" })` to force a surface even when profiles are closed.

## Sweep

![Sweep example](/examples/dsl/sweep.iso.png)

```ts
const line = sketchLine("line-1", [-8, 0], [8, 0]);
const sketch = sketch2d(
  "sketch-sweep",
  [
    {
      name: "profile:line",
      profile: profileSketchLoop(["line-1"], { open: true }),
    },
  ],
  { entities: [line] }
);
const path = pathPolyline([
  [0, 0, 0],
  [0, 0, 20],
  [15, 0, 30],
]);

const examplePart = part("example-sweep", [
  sketch,
  sweep("sweep-1", profileRef("profile:line"), path, "surface:main", undefined, {
    mode: "surface",
  }),
]);
```

Notes:
- Default output is `body:*` when the profile is closed; open profiles output a surface.
- The sweep profile should be positioned at the path start and lie in a plane
  perpendicular to the path tangent at that start point.
- Use `{ orientation: "frenet" }` to follow the path Frenet frame; the default
  is a fixed frame. If you provide `frame`, orientation is fixed to that frame.

## Shell

![Shell example](/examples/dsl/shell.iso.png)

```ts
const topFace = selectorFace(
  [predCreatedBy("base"), predPlanar(), predNormal("+Z")],
  [rankMaxArea()]
);

const examplePart = part("example-shell", [
  extrude("base", profileRect(60, 40), 20, "body:base"),
  shell("shell-1", selectorNamed("body:base"), 2, "body:main", undefined, {
    direction: "inside",
    openFaces: [topFace],
  }),
]);
```

Notes:
- `shell` offsets a solid inward or outward and can remove faces to create openings.

## Mirror

![Mirror example](/examples/dsl/mirror.iso.png)

```ts
const rect = sketchRectCenter("rect-1", [26, 0], 60, 10, {
  rotation: Math.PI / 5,
});
const sketch = sketch2d(
  "sketch-v",
  [{ name: "profile:bar", profile: profileSketchLoop(["rect-1"]) }],
  { entities: [rect] }
);

const examplePart = part("example-mirror", [
  sketch,
  extrude("bar", profileRef("profile:bar"), 6, "body:base"),
  datumPlane("mirror-plane", "+X"),
  mirror(
    "mirror-1",
    selectorNamed("body:base"),
    planeDatum("mirror-plane"),
    "body:mirror"
  ),
  booleanOp(
    "union-1",
    "union",
    selectorNamed("body:base"),
    selectorNamed("body:mirror"),
    "body:main"
  ),
]);
```

## Thicken

![Thicken example](/examples/dsl/thicken.iso.png)

```ts
const rect = sketchRectCorner("rect-1", [0, 0], 40, 20);
const sketch = sketch2d(
  "sketch-face",
  [{ name: "profile:rect", profile: profileSketchLoop(["rect-1"]) }],
  { entities: [rect] }
);

const examplePart = part("example-thicken", [
  sketch,
  surface("face-1", profileRef("profile:rect"), "surface:main"),
  thicken("thicken-1", selectorNamed("surface:main"), 4, "body:main"),
]);
```

Notes:
- `thicken` supports planar faces and can offset curved faces.
- Use `{ direction: "reverse" }` to thicken opposite the face normal.
- Curved thicken works best on closed surfaces (e.g., torus-like faces); open
  curved surfaces may require `shell` instead.

## Modelled Thread

![Modelled thread example](/examples/dsl/thread.iso.png)

```ts
const examplePart = part("example-thread", [
  thread("thread-1", "+Z", 24, 22, 3.5, "body:main", undefined, {
    minorDiameter: 14,
    segmentsPerTurn: 24,
  }),
]);
```

Notes:
- Use `booleanOp(..., "subtract", ...)` with a thread solid to cut internal threads.
- Prefer `cosmeticThread` unless you need explicit thread geometry.

## Hole

![Hole example](/examples/dsl/hole.iso.png)

```ts
const examplePart = part("example-hole", [
  extrude("base", profileRect(90, 50), 12, "body:main"),
  hole(
    "hole-1",
    selectorFace([predPlanar()], [rankMaxZ()]),
    "-Z",
    14,
    "throughAll",
    { deps: ["base"] }
  ),
]);
```

Counterbores and countersinks are optional via `counterbore` / `countersink`
in the options object (they are mutually exclusive). `countersink.angle` uses
radians; use `exprLiteral(82, "deg")` if you prefer degrees.

![Hole counterbore/countersink example](/examples/dsl/hole-advanced.iso.png)

```ts
const examplePart = part("example-hole-advanced", [
  extrude("base", profileRect(120, 50), 12, "body:main"),
  hole(
    "hole-counterbore",
    selectorFace([predPlanar()], [rankMaxZ()]),
    "-Z",
    8,
    "throughAll",
    {
      counterbore: { diameter: 16, depth: 4 },
      position: [-30, 0],
      deps: ["base"],
    }
  ),
  hole(
    "hole-countersink",
    selectorFace([predPlanar()], [rankMaxZ()]),
    "-Z",
    8,
    "throughAll",
    {
      countersink: { diameter: 18, angle: Math.PI / 2 },
      position: [30, 0],
      deps: ["hole-counterbore"],
    }
  ),
]);
```

## Fillet

![Fillet example](/examples/dsl/fillet.iso.png)

```ts
const examplePart = part("example-fillet", [
  extrude("cyl", profileCircle(14), 28, "body:main"),
  fillet(
    "edge-fillet",
    selectorEdge([predCreatedBy("cyl")], [rankMaxZ()]),
    3,
    ["cyl"]
  ),
]);
```

## Chamfer

![Chamfer example](/examples/dsl/chamfer.iso.png)

```ts
const examplePart = part("example-chamfer", [
  extrude("block", profileRect(40, 26), 12, "body:main"),
  chamfer(
    "edge-chamfer",
    selectorEdge([predCreatedBy("block")]),
    2,
    ["block"]
  ),
]);
```

## Boolean Union

![Boolean example](/examples/dsl/boolean.iso.png)

```ts
const examplePart = part("example-boolean", [
  extrude("base", profileRect(50, 26), 12, "body:base"),
  extrude(
    "tool",
    profileRect(26, 26, [12, 0, 0]),
    12,
    "body:tool"
  ),
  booleanOp(
    "union-1",
    "union",
    selectorNamed("body:base"),
    selectorNamed("body:tool"),
    "body:main",
    ["base", "tool"]
  ),
]);
```
