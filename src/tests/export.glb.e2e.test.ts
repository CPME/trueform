import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { exportGlb } from "../export/gltf.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "export glb: emits glTF 2.0 header",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("glb-plate", [
        dsl.extrude("base", dsl.profileRect(40, 20), 8, "body:main"),
      ]);
      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const mesh = backend.mesh(body, { includeEdges: false });
      const glb = exportGlb({ name: "plate", mesh });
      assert.ok(glb.byteLength > 20, "GLB output should be non-empty");

      const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
      assert.equal(view.getUint32(0, true), 0x46546c67, "GLB magic mismatch");
      assert.equal(view.getUint32(4, true), 2, "GLB version should be 2");

      const jsonLength = view.getUint32(12, true);
      const jsonType = view.getUint32(16, true);
      assert.equal(jsonType, 0x4e4f534a, "GLB JSON chunk missing");
      const jsonStart = 20;
      const jsonText = new TextDecoder().decode(glb.slice(jsonStart, jsonStart + jsonLength));
      const gltf = JSON.parse(jsonText.trim());
      assert.equal(gltf.asset?.version, "2.0", "glTF asset version should be 2.0");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
