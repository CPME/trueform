import assert from "node:assert/strict";
import { buildPart } from "../executor.js";
import { renderIsometricPng } from "../viewer/isometric_renderer.js";
import { dslFeatureExamples } from "../examples/dsl_feature_examples.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const MESHABLE_KINDS = new Set(["solid", "surface", "face"]);

function isMeshable(value: { kind: string }): boolean {
  return MESHABLE_KINDS.has(value.kind);
}

const tests = dslFeatureExamples.map((example) => ({
  name: `docs examples: renders ${example.id}`,
  fn: async () => {
    const { backend } = await getBackendContext();
    const result = buildPart(example.part, backend);
    const candidateKeys = [
      ...(example.render?.layers?.map((layer) => layer.output) ?? []),
      "body:main",
    ];
    let target:
      | {
          key: string;
          value: (typeof result.final.outputs extends Map<string, infer V> ? V : never);
        }
      | undefined;
    for (const key of candidateKeys) {
      const value = result.final.outputs.get(key);
      if (value && isMeshable(value)) {
        target = { key, value };
        break;
      }
    }
    if (!target) {
      for (const [key, value] of result.final.outputs) {
        if (isMeshable(value)) {
          target = { key, value };
          break;
        }
      }
    }

    assert.ok(
      target,
      `missing meshable output for ${example.id}; available: ${Array.from(result.final.outputs.keys()).join(", ")}`
    );

    const body = target.value;
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
