import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { MockBackend } from "../mock_backend.js";

const part = dsl.part("plate", [
  dsl.sketch2d("sketch-base", [
    {
      name: "profile:base",
      profile: dsl.profileRect(100, 60),
    },
  ]),
  dsl.extrude(
    "base-extrude",
    dsl.profileRef("profile:base"),
    6,
    "body:main",
    ["sketch-base"]
  ),
]);

const backend = new MockBackend();
const built = buildPart(part, backend);
console.log(JSON.stringify(built, null, 2));
