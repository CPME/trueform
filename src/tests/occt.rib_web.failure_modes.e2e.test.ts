import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt rib/web failure: rib rejects closed sketch profiles",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("rib-closed-profile", [
        dsl.sketch2d(
          "rib-sketch",
          [{ name: "profile:rib", profile: dsl.profileSketchLoop(["l1", "l2", "l3", "l4"]) }],
          {
            entities: [
              dsl.sketchLine("l1", [-6, -2], [6, -2]),
              dsl.sketchLine("l2", [6, -2], [6, 2]),
              dsl.sketchLine("l3", [6, 2], [-6, 2]),
              dsl.sketchLine("l4", [-6, 2], [-6, -2]),
            ],
          }
        ),
        dsl.rib("rib", dsl.profileRef("profile:rib"), 2, 8, "body:rib", ["rib-sketch"]),
      ]);
      assert.throws(() => buildPart(part, backend), /requires an open sketch profile/i);
    },
  },
  {
    name: "occt rib/web failure: web rejects non-sketch profiles",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("web-non-sketch-profile", [
        dsl.web("web", dsl.profileRect(8, 2), 2, 8, "body:web"),
      ]);
      assert.throws(() => buildPart(part, backend), /requires profileRef/i);
    },
  },
  {
    name: "occt rib/web failure: rib rejects non-positive thickness/depth",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("rib-invalid-size", [
        dsl.sketch2d(
          "rib-sketch",
          [{ name: "profile:rib", profile: dsl.profileSketchLoop(["l1"], { open: true }) }],
          { entities: [dsl.sketchLine("l1", [-8, 0], [8, 0])] }
        ),
        dsl.rib("rib", dsl.profileRef("profile:rib"), 0, 8, "body:rib", ["rib-sketch"]),
      ]);
      assert.throws(() => buildPart(part, backend), /thickness must be positive/i);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
