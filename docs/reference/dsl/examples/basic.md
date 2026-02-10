# Basic DSL Example

## Basic Part

```ts
import { buildPart } from "trueform";
import { part } from "trueform/dsl/core";
import { extrude, profileRect, profileRef, sketch2d } from "trueform/dsl/geometry";

const plate = part("plate", [
  sketch2d("sketch-base", [
    { name: "profile:base", profile: profileRect(100, 60) },
  ]),
  extrude(
    "base-extrude",
    profileRef("profile:base"),
    6,
    "body:main",
    ["sketch-base"]
  ),
]);

// const backend = ...
// const result = buildPart(plate, backend);
```
