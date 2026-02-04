import { dsl } from "../dsl.js";

export const viewerPart = dsl.part("viewer-ring", [
  dsl.revolve(
    "ring-revolve",
    dsl.profileRect(2, 4, [10, 0, 0]),
    "+Z",
    "full",
    "body:main"
  ),
]);
