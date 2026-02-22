import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt split failures: split body source must resolve to a single owner",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("split-body-owner-mismatch", [
        dsl.sketch2d("sketch-a", [{ name: "profile:a", profile: dsl.profileRect(10, 8, [-8, 0, 0]) }]),
        dsl.extrude("body-a", dsl.profileRef("profile:a"), 6, "body:a", ["sketch-a"]),
        dsl.sketch2d("sketch-b", [{ name: "profile:b", profile: dsl.profileRect(10, 8, [8, 0, 0]) }]),
        dsl.extrude("body-b", dsl.profileRef("profile:b"), 6, "body:b", ["sketch-b"]),
        dsl.plane("tool", 28, 20, "surface:tool", { origin: [0, 0, 3], deps: ["body-a", "body-b"] }),
        dsl.splitBody(
          "split-body",
          dsl.selectorFace([dsl.predPlanar()]),
          dsl.selectorNamed("surface:tool"),
          "body:split",
          ["body-a", "body-b", "tool"]
        ),
      ]);

      assert.throws(
        () => buildPart(part, backend),
        (err) =>
          err instanceof Error &&
          err.message.includes("split body source selector must resolve to a single owner")
      );
    },
  },
  {
    name: "occt split failures: split body source must be solid/face",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("split-body-source-kind", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(12, 8) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 6, "body:main", [
          "sketch-base",
        ]),
        dsl.plane("tool", 20, 20, "surface:tool", { origin: [0, 0, 3], deps: ["base-extrude"] }),
        dsl.splitBody(
          "split-body",
          dsl.selectorEdge([dsl.predCreatedBy("base-extrude")]),
          dsl.selectorNamed("surface:tool"),
          "body:split",
          ["base-extrude", "tool"]
        ),
      ]);

      assert.throws(
        () => buildPart(part, backend),
        (err) =>
          err instanceof Error &&
          err.message.includes("split body source selector must resolve to solid/face")
      );
    },
  },
  {
    name: "occt split failures: split face selector must resolve to a single owner",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("split-face-owner-mismatch", [
        dsl.sketch2d("sketch-a", [{ name: "profile:a", profile: dsl.profileRect(10, 8, [-8, 0, 0]) }]),
        dsl.extrude("body-a", dsl.profileRef("profile:a"), 6, "body:a", ["sketch-a"]),
        dsl.sketch2d("sketch-b", [{ name: "profile:b", profile: dsl.profileRect(10, 8, [8, 0, 0]) }]),
        dsl.extrude("body-b", dsl.profileRef("profile:b"), 6, "body:b", ["sketch-b"]),
        dsl.plane("tool", 28, 20, "surface:tool", { origin: [0, 0, 3], deps: ["body-a", "body-b"] }),
        dsl.splitFace(
          "split-face",
          dsl.selectorFace([dsl.predPlanar()]),
          dsl.selectorNamed("surface:tool"),
          "body:split",
          ["body-a", "body-b", "tool"]
        ),
      ]);

      assert.throws(
        () => buildPart(part, backend),
        (err) =>
          err instanceof Error &&
          err.message.includes("split face selector must resolve to a single owner")
      );
    },
  },
  {
    name: "occt split failures: split face tool selector must be solid/face/surface",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("split-face-tool-kind", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(12, 8) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 6, "body:main", [
          "sketch-base",
        ]),
        dsl.splitFace(
          "split-face",
          dsl.selectorFace([dsl.predPlanar(), dsl.predCreatedBy("base-extrude")], [dsl.rankMaxArea()]),
          dsl.selectorEdge([dsl.predCreatedBy("base-extrude")]),
          "body:split",
          ["base-extrude"]
        ),
      ]);

      assert.throws(
        () => buildPart(part, backend),
        (err) =>
          err instanceof Error &&
          err.message.includes("split face tool selector must resolve to solid/face/surface")
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
