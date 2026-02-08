import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { export3mf } from "../export/three_mf.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "export 3mf: emits model XML",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("mf-plate", [
        dsl.extrude("base", dsl.profileRect(40, 20), 8, "body:main"),
      ]);
      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const mesh = backend.mesh(body, { includeEdges: false });
      const data = export3mf(mesh, { unit: "mm", name: "plate" });
      assert.ok(data.byteLength > 0, "3MF output should be non-empty");

      const files = unzipSync(data);
      const model = files["3D/3dmodel.model"];
      assert.ok(model, "3MF model file missing");
      const xml = strFromU8(model);
      assert.ok(xml.includes("<model"), "3MF model XML missing <model>");
      assert.ok(xml.includes("<triangle"), "3MF model XML missing <triangle>");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
