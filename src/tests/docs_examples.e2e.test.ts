import assert from "node:assert/strict";
import { buildPart } from "../executor.js";
import { renderIsometricPng } from "../viewer/isometric_renderer.js";
import { dslFeatureExamples } from "../examples/dsl_feature_examples.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = dslFeatureExamples.map((example) => ({
  name: `docs examples: renders ${example.id}`,
  fn: async () => {
    const { backend } = await getBackendContext();
    const result = buildPart(example.part, backend);
    const body = result.final.outputs.get("body:main");
    assert.ok(body, `missing body:main output for ${example.id}`);
    const mesh = backend.mesh(body, {
      linearDeflection: 0.6,
      angularDeflection: 0.6,
      parallel: true,
    });
    assert.ok(mesh.positions.length > 0, "mesh positions should be non-empty");
    const png = renderIsometricPng(mesh, { width: 640, height: 480 });
    assert.ok(png.length > 1024, "png output should be non-empty");
  },
}));

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
