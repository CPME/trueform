import assert from "node:assert/strict";
import initOpenCascade from "opencascade.js/dist/node.js";
import { dsl } from "../dsl.js";
import { buildPartAsync } from "../executor.js";
import { backendToAsync } from "../backend-spi.js";
import { OcctBackend } from "../backend_occt.js";
import { OcctNativeBackend } from "../backend_occt_native.js";
import { LocalOcctTransport } from "../backend_occt_native_local.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt native local parity: matches direct occt.js output keys and selection ids for simple extrude",
    fn: async () => {
      const occt = await initOpenCascade();
      const directBackend = backendToAsync(new OcctBackend({ occt }));
      const nativeBackend = new OcctNativeBackend({
        transport: new LocalOcctTransport({ occt, backend: new OcctBackend({ occt }) }),
      });

      const part = dsl.part("native-local-parity", [
        dsl.datumPlane("base-plane", "+Z"),
        dsl.extrude("base", dsl.profileRect(20, 10), 5, "body:main"),
      ]);

      const direct = await buildPartAsync(part, directBackend);
      const native = await buildPartAsync(part, nativeBackend);

      assert.deepEqual(
        [...direct.final.outputs.keys()].sort(),
        [...native.final.outputs.keys()].sort()
      );

      const directSelections = direct.final.selections.map((selection) => selection.id).sort();
      const nativeSelections = native.final.selections.map((selection) => selection.id).sort();
      assert.deepEqual(nativeSelections, directSelections);

      const directBody = direct.final.outputs.get("body:main");
      const nativeBody = native.final.outputs.get("body:main");
      assert.equal(nativeBody?.kind, directBody?.kind);
      assert.equal(nativeBody?.id, directBody?.id);
      assert.equal(typeof nativeBody?.meta["handle"], "string");
      await nativeBackend.close?.();
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
