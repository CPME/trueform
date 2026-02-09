import assert from "node:assert/strict";
import initOpenCascade from "opencascade.js/dist/node.js";
import { dsl } from "../dsl.js";
import { buildPartAsync } from "../executor.js";
import { OcctNativeBackend } from "../backend_occt_native.js";
import { LocalOcctTransport } from "../backend_occt_native_local.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt native local: async build + mesh via transport handles",
    fn: async () => {
      const occt = await initOpenCascade();
      const transport = new LocalOcctTransport({ occt });
      const backend = new OcctNativeBackend({ transport });
      const part = dsl.part("native-local", [
        dsl.extrude("base", dsl.profileRect(30, 12), 6, "body:main"),
      ]);

      const result = await buildPartAsync(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      const handle = body.meta["handle"];
      assert.equal(typeof handle, "string", "expected shape handle in output meta");

      const mesh = await backend.mesh(body, { linearDeflection: 0.2 });
      assert.ok(mesh.positions.length > 0, "mesh should contain positions");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
