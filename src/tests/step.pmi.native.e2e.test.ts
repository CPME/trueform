import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import {
  exportStepAp242WithPmiAsync,
  type StepWithPmiAsyncResult,
} from "../export/step.js";
import { TF_PMI_SCHEMA } from "../pmi.js";
import type { BackendAsync, KernelObject, KernelResult } from "../backend.js";
import { runTests } from "./occt_test_utils.js";

function makePart() {
  const target = dsl.refSurface(
    dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxArea()])
  );
  return dsl.part(
    "pmi-plate-async",
    [dsl.extrude("base", dsl.profileRect(40, 20), 8, "body:main")],
    {
      datums: [dsl.datumFeature("datum-A", "A", target)],
      constraints: [dsl.surfaceProfileConstraint("c1", target, 0.05)],
    }
  );
}

function stubBackend(
  opts: {
    withEmbedded?: boolean;
    onPmi?: (pmi: unknown) => void;
  } = {}
): BackendAsync {
  const base: BackendAsync = {
    execute: async (): Promise<KernelResult> => {
      throw new Error("execute not implemented in stub");
    },
    mesh: async () => {
      throw new Error("mesh not implemented in stub");
    },
    exportStep: async () => new Uint8Array([1, 2, 3]),
  };
  if (!opts.withEmbedded) return base;
  return {
    ...base,
    exportStepWithPmi: async (_target, pmi) => {
      opts.onPmi?.(pmi);
      return new Uint8Array([9, 8, 7]);
    },
  };
}

const tests = [
  {
    name: "step ap242 pmi async: uses embedded export when supported",
    fn: async () => {
      const part = makePart();
      const target: KernelObject = { id: "body:main", kind: "solid", meta: {} };
      let seenPmi: any = null;
      const backend = stubBackend({
        withEmbedded: true,
        onPmi: (pmi) => {
          seenPmi = pmi;
        },
      });

      const result = await exportStepAp242WithPmiAsync(
        backend,
        target,
        part,
        { schema: "AP242" }
      );
      const payload = seenPmi as { schema?: string; constraints?: unknown[] } | null;
      assert.ok(payload, "expected PMI payload to be sent to embedded export");
      assert.equal(payload?.schema, TF_PMI_SCHEMA);
      assert.ok((payload?.constraints?.length ?? 0) > 0, "expected constraints in PMI payload");
      assert.equal(result.embedded, true);
      assert.ok(result.step.byteLength > 0, "expected STEP bytes");
      assert.equal(result.pmi, undefined);
    },
  },
  {
    name: "step ap242 pmi async: falls back to JSON sidecar when embedded not supported",
    fn: async () => {
      const part = makePart();
      const target: KernelObject = { id: "body:main", kind: "solid", meta: {} };
      const backend = stubBackend();

      const result: StepWithPmiAsyncResult = await exportStepAp242WithPmiAsync(
        backend,
        target,
        part,
        { schema: "AP242" }
      );
      assert.equal(result.embedded, false);
      assert.ok(result.pmi, "expected PMI JSON sidecar");
      assert.ok(result.pmi?.includes("constraint.surfaceProfile"));
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
