import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { backendToAsync } from "../backend_async.js";
import { buildPartAsync } from "../executor.js";
import { assertValidShape, getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "backend async adapter: builds part via async executor",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const asyncBackend = backendToAsync(backend);
      const part = dsl.part("async-plate", [
        dsl.extrude("base-extrude", dsl.profileRect(20, 10), 5, "body:main"),
      ]);

      const result = await buildPartAsync(part, asyncBackend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "async extrude solid");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
