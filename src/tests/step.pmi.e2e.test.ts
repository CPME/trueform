import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { exportStepAp242WithPmi } from "../export/step.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "step ap242 pmi: emits PMI JSON sidecar",
    fn: async () => {
      const { backend } = await getBackendContext();
      const target = dsl.refSurface(
        dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxArea()])
      );
      const part = dsl.part(
        "pmi-plate",
        [dsl.extrude("base", dsl.profileRect(40, 20), 8, "body:main")],
        {
          datums: [dsl.datumFeature("datum-A", "A", target)],
          constraints: [dsl.surfaceProfileConstraint("c1", target, 0.05)],
        }
      );
      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const { step, pmi } = exportStepAp242WithPmi(backend, body, part, {
        schema: "AP242",
      });
      assert.ok(step.byteLength > 0, "STEP output should be non-empty");
      assert.ok(pmi, "PMI JSON should be returned");
      assert.ok(pmi?.includes("constraint.surfaceProfile"), "PMI JSON missing constraint");
      assert.ok(pmi?.includes("datum.feature"), "PMI JSON missing datum");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
