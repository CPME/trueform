import assert from "node:assert/strict";
import { compilePartWithHashes } from "../compiler.js";
import { dsl } from "../dsl.js";
import { preparePart } from "../part_preparation.js";
import { runTests } from "./occt_test_utils.js";

const makePart = () =>
  dsl.part(
    "prepared-part",
    [
      dsl.sketch2d("sketch-base", [
        { name: "profile:base", profile: dsl.profileRect(10, 5) },
      ]),
      dsl.extrude(
        "base-extrude",
        dsl.profileRef("profile:base"),
        dsl.exprParam("thickness"),
        "body:main",
        ["sketch-base"]
      ),
      dsl.fillet(
        "edge-fillet",
        dsl.selectorEdge([dsl.predCreatedBy("base-extrude")]),
        1,
        ["base-extrude"]
      ),
    ],
    { params: [dsl.paramLength("thickness", dsl.exprLiteral(2))] }
  );

const tests = [
  {
    name: "part preparation: compile hashes reuse prepared feature order and hashes",
    fn: async () => {
      const part = makePart();
      const prepared = preparePart(part, undefined, undefined, "mm");
      const compiled = compilePartWithHashes(part, undefined, "mm");

      assert.deepEqual(prepared.featureOrder, compiled.order);
      assert.deepEqual(
        Object.fromEntries(compiled.hashes.entries()),
        prepared.featureHashes
      );
      assert.equal(prepared.normalized.id, compiled.partId);
      assert.equal(prepared.featureById.get("base-extrude")?.kind, "feature.extrude");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
