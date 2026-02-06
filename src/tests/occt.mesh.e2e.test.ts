import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt mesh: exports non-empty positions/normals",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("mesh-plate", [
        dsl.extrude("base", dsl.profileRect(50, 30), 6, "body:main"),
      ]);
      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const mesh = backend.mesh(body);
      assert.ok(mesh.positions.length > 0, "mesh positions should be non-empty");
      assert.ok((mesh.indices?.length ?? 0) > 0, "mesh indices should be non-empty");
      assert.equal(
        mesh.normals?.length,
        mesh.positions.length,
        "mesh normals should match positions length"
      );
      assert.ok(
        (mesh.edgePositions?.length ?? 0) > 0,
        "mesh edge positions should be non-empty"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
