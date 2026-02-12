# Basic DSL Example

## Basic Part

```ts
import { buildPart } from "trueform";
import { part } from "trueform/dsl/core";
import { sketch2d, profileRect, profileRef } from "trueform/dsl/sketch";
import { extrude } from "trueform/dsl/features";

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
