import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertPositiveVolume,
  countFaces,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: revolve rectangle produces solid output",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const part = dsl.part("ring", [
        dsl.revolve(
          "ring-revolve",
          dsl.profileRect(2, 4, [1, 2, 0]),
          "+X",
          "full",
          "body:main"
        ),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      assert.equal(result.partId, "ring");
      assert.deepEqual(result.order, ["ring-revolve"]);

      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      const isNull = typeof shape.IsNull === "function" ? shape.IsNull() : false;
      assert.equal(isNull, false, "expected non-null OCCT shape");
      assertPositiveVolume(occt, shape, "revolve solid");

      const faceCount = countFaces(occt, shape);
      assert.ok(faceCount >= 3, `expected at least 3 faces, got ${faceCount}`);
    },
  },
  {
    name: "occt e2e: sketch revolve emits history-backed side ids and partial caps",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const sketch = dsl.sketch2d(
        "sketch-profile",
        [
          {
            name: "profile:loop",
            profile: dsl.profileSketchLoop(["line-1", "line-2", "line-3", "line-4"]),
          },
        ],
        {
          entities: [
            dsl.sketchLine("line-1", [2, 0], [4, 0]),
            dsl.sketchLine("line-2", [4, 0], [4, 2]),
            dsl.sketchLine("line-3", [4, 2], [2, 2]),
            dsl.sketchLine("line-4", [2, 2], [2, 0]),
          ],
        }
      );
      const part = dsl.part("revolve-sketch-partial", [
        sketch,
        dsl.revolve(
          "sketch-revolve",
          dsl.profileRef("profile:loop"),
          "+Y",
          Math.PI,
          "body:main"
        ),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertPositiveVolume(occt, shape, "partial sketch revolve");

      const faceIds = result.final.selections
        .filter(
          (selection) =>
            selection.kind === "face" &&
            selection.meta["createdBy"] === "sketch-revolve"
        )
        .map((selection) => selection.id)
        .sort();
      assert.deepEqual(faceIds, [
        "face:body.main~sketch-revolve.profile.line-1",
        "face:body.main~sketch-revolve.profile.line-2",
        "face:body.main~sketch-revolve.profile.line-3",
        "face:body.main~sketch-revolve.profile.line-4",
      ]);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
