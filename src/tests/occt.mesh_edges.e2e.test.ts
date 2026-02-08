import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: mesh edges omit smooth seam edges",
    fn: async () => {
      const { backend } = await getBackendContext();
      const length = 20;
      const part = dsl.part("pipe-edges", [
        dsl.pipe("pipe-1", "+Z", length, 10, 6, "body:main"),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const mesh = backend.mesh(body, {
        linearDeflection: 0.5,
        angularDeflection: 0.5,
      });
      const edges = mesh.edgePositions ?? [];
      assert.ok(edges.length > 0, "expected mesh edge positions");

      const z0 = 0;
      const z1 = length;
      const eps = 1e-3;
      let seamSegments = 0;
      for (let i = 0; i + 5 < edges.length; i += 6) {
        const za = edges[i + 2] ?? 0;
        const zb = edges[i + 5] ?? 0;
        const onCapA = Math.abs(za - z0) <= eps || Math.abs(za - z1) <= eps;
        const onCapB = Math.abs(zb - z0) <= eps || Math.abs(zb - z1) <= eps;
        if (!(onCapA && onCapB)) seamSegments += 1;
      }
      assert.equal(
        seamSegments,
        0,
        `expected no seam edge segments, got ${seamSegments}`
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
