import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertPositiveVolume,
  assertValidShape,
  countFaces,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: extrude closed sketch loop",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("sketch-loop", [
        dsl.sketch2d(
          "sketch-base",
          [
            {
              name: "profile:loop",
              profile: dsl.profileSketchLoop([
                "line-1",
                "line-2",
                "line-3",
                "line-4",
              ]),
            },
          ],
          {
            entities: [
              dsl.sketchLine("line-1", [0, 0], [40, 0]),
              dsl.sketchLine("line-2", [40, 0], [40, 20]),
              dsl.sketchLine("line-3", [40, 20], [0, 20]),
              dsl.sketchLine("line-4", [0, 20], [0, 0]),
            ],
          }
        ),
        dsl.extrude(
          "sketch-extrude",
          dsl.profileRef("profile:loop"),
          8,
          "body:main",
          ["sketch-base"]
        ),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "sketch loop extrude solid");
      assertPositiveVolume(occt, shape, "sketch loop extrude solid");

      const faceCount = countFaces(occt, shape);
      assert.ok(faceCount >= 6, `expected at least 6 faces, got ${faceCount}`);
    },
  },
  {
    name: "occt e2e: reject open sketch loop",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("sketch-loop-open", [
        dsl.sketch2d(
          "sketch-base",
          [
            {
              name: "profile:loop",
              profile: dsl.profileSketchLoop(["line-1", "line-2", "line-3"]),
            },
          ],
          {
            entities: [
              dsl.sketchLine("line-1", [0, 0], [40, 0]),
              dsl.sketchLine("line-2", [40, 0], [40, 20]),
              dsl.sketchLine("line-3", [40, 20], [0, 20]),
            ],
          }
        ),
        dsl.extrude(
          "sketch-extrude",
          dsl.profileRef("profile:loop"),
          8,
          "body:main",
          ["sketch-base"]
        ),
      ]);

      let threw = false;
      try {
        buildPart(part, backend);
      } catch (err) {
        threw = true;
        const message = err instanceof Error ? err.message : String(err);
        assert.ok(
          message.includes("sketch loop"),
          `unexpected error message: ${message}`
        );
      }
      assert.ok(threw, "expected open sketch loop to throw");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
