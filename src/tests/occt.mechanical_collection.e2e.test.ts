import assert from "node:assert/strict";
import { buildPart } from "../executor.js";
import { mechanicalCollection } from "../examples/mechanical_collection.js";
import {
  assertPositiveVolume,
  assertValidShape,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = mechanicalCollection.map((entry) => ({
  name: `occt e2e: mechanical collection ${entry.id}`,
  fn: async () => {
    const { occt, backend } = await getBackendContext();
    const result = buildPart(entry.part, backend);
    const body = result.final.outputs.get("body:main");
    assert.ok(body, `missing body:main output for ${entry.id}`);

    const shape = body.meta["shape"] as any;
    assert.ok(shape, `missing shape metadata for ${entry.id}`);
    assertValidShape(occt, shape, `${entry.id} solid`);
    assertPositiveVolume(occt, shape, `${entry.id} solid`);
  },
}));

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
