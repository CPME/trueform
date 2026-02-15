# Generator Examples

The examples below are rendered from OpenCascade.js output via
`npm run docs:examples`.

Use generators for authoring-time repetition. If you need runtime pattern intent
in the model graph, use `patternLinear` / `patternCircular` instead.

## Feature Array

![Feature array example](/examples/dsl/feature-array.iso.png)

```ts
const baseThickness = 6;
const bossHeight = 8;
const bossSize = 16;

const base = extrude(
  "base",
  profileRect(120, 80, [0, 0, 0]),
  baseThickness,
  "body:base"
);

const cubes = featureArray(
  { count: [3, 2], spacing: [36, 36], origin: [-36, -18, baseThickness] },
  ({ index, offset }) =>
    extrude(
      `cube-${index}`,
      profileRect(bossSize, bossSize, offset),
      bossHeight,
      `body:cube-${index}`
    )
);

const unions = [];
let current = "body:base";
for (let i = 0; i < cubes.length; i++) {
  const result = i === cubes.length - 1 ? "body:main" : `body:union-${i}`;
  unions.push(
    booleanOp(
      `union-${i}`,
      "union",
      selectorNamed(current),
      selectorNamed(`body:cube-${i}`),
      result
    )
  );
  current = result;
}

const examplePart = part("example-feature-array", [base, ...cubes, ...unions]);
```

## Sketch Array

![Sketch array example](/examples/sketch/rect-array.svg)

```ts
const exampleSketch = sketch2d("sketch-rect-array", [], {
  entities: sketchArray(
    { count: [3, 2], spacing: [28, 18], origin: [-28, -9] },
    ({ index, offset }) => sketchRectCenter(`rect-${index}`, offset, 18, 10)
  ),
});
```

## Circular Array

![Circular array example](/examples/dsl/circular-array.iso.png)

```ts
const baseThickness = 6;
const bossHeight = 8;
const bossRadius = 6;

const base = extrude(
  "base",
  profileRect(140, 100, [0, 0, 0]),
  baseThickness,
  "body:base"
);

const bosses = featureCircularArray(
  { count: 8, radius: 36, center: [0, 0, baseThickness], units: "deg" },
  ({ index, offset }) =>
    extrude(
      `boss-${index}`,
      profileCircle(bossRadius, offset),
      bossHeight,
      `body:boss-${index}`
    )
);

const unions = [];
let current = "body:base";
for (let i = 0; i < bosses.length; i++) {
  const result = i === bosses.length - 1 ? "body:main" : `body:union-${i}`;
  unions.push(
    booleanOp(
      `union-${i}`,
      "union",
      selectorNamed(current),
      selectorNamed(`body:boss-${i}`),
      result
    )
  );
  current = result;
}

const examplePart = part("example-circular-array", [base, ...bosses, ...unions]);
```

## Radial Array

![Radial array example](/examples/dsl/radial-array.iso.png)

```ts
const baseThickness = 6;
const bossHeight = 8;
const bossSize = 10;

const base = extrude(
  "base",
  profileRect(160, 110, [0, 0, 0]),
  baseThickness,
  "body:base"
);

const bosses = featureRadialArray(
  {
    count: [6, 3],
    radiusStep: 18,
    radiusStart: 18,
    center: [0, 0, baseThickness],
    angleStep: 60,
    units: "deg",
  },
  ({ index, offset }) =>
    extrude(
      `boss-${index}`,
      profileRect(bossSize, bossSize, offset),
      bossHeight,
      `body:boss-${index}`
    )
);

const unions = [];
let current = "body:base";
for (let i = 0; i < bosses.length; i++) {
  const result = i === bosses.length - 1 ? "body:main" : `body:union-${i}`;
  unions.push(
    booleanOp(
      `union-${i}`,
      "union",
      selectorNamed(current),
      selectorNamed(`body:boss-${i}`),
      result
    )
  );
  current = result;
}

const examplePart = part("example-radial-array", [base, ...bosses, ...unions]);
```

## Spline Array

![Spline array example](/examples/dsl/spline-array.iso.png)

```ts
const baseThickness = 6;
const bossHeight = 8;
const bossSize = 12;

const base = extrude(
  "base",
  profileRect(160, 90, [0, 0, 0]),
  baseThickness,
  "body:base"
);

const bosses = featureArrayAlongSpline(
  {
    points: [
      [-60, -20, baseThickness],
      [-30, 25, baseThickness],
      [20, -10, baseThickness],
      [60, 30, baseThickness],
    ],
    count: 7,
    mode: "spline",
  },
  ({ index, offset }) =>
    extrude(
      `boss-${index}`,
      profileRect(bossSize, bossSize, offset),
      bossHeight,
      `body:boss-${index}`
    )
);

const unions = [];
let current = "body:base";
for (let i = 0; i < bosses.length; i++) {
  const result = i === bosses.length - 1 ? "body:main" : `body:union-${i}`;
  unions.push(
    booleanOp(
      `union-${i}`,
      "union",
      selectorNamed(current),
      selectorNamed(`body:boss-${i}`),
      result
    )
  );
  current = result;
}

const examplePart = part("example-spline-array", [base, ...bosses, ...unions]);
```
