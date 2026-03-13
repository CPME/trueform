import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPartCacheKey } from "../build_cache.js";
import { preparePart } from "../part_preparation.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "build cache: overrides influence cache key",
    fn: async () => {
      const part = dsl.part(
        "plate",
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
        ],
        { params: [dsl.paramLength("thickness", dsl.exprLiteral(2))] }
      );
      const ctx = dsl.context();
      const keyA = buildPartCacheKey(part, ctx, { thickness: 2 });
      const keyB = buildPartCacheKey(part, ctx, { thickness: 4 });

      assert.notEqual(keyA.overridesHash, keyB.overridesHash);
      assert.notEqual(
        keyA.featureHashes["base-extrude"],
        keyB.featureHashes["base-extrude"]
      );
      assert.equal(keyA.partId, "plate");
      assert.ok(keyA.featureOrder.length > 0);

      const prepared = preparePart(part, { thickness: 2 }, undefined, ctx.units);
      assert.deepEqual(keyA.featureOrder, prepared.featureOrder);
      assert.deepEqual(keyA.featureHashes, prepared.featureHashes);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
