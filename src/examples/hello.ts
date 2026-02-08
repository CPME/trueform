import { part } from "../dsl/core.js";
import { extrude, profileRect, profileRef, sketch2d } from "../dsl/geometry.js";
import { buildPart } from "../executor.js";
import { MockBackend } from "../mock_backend.js";

const plate = part("plate", [
  sketch2d("sketch-base", [
    {
      name: "profile:base",
      profile: profileRect(100, 60),
    },
  ]),
  extrude(
    "base-extrude",
    profileRef("profile:base"),
    6,
    "body:main",
    ["sketch-base"]
  ),
]);

const backend = new MockBackend();
const built = buildPart(plate, backend);
console.log(JSON.stringify(built, null, 2));
