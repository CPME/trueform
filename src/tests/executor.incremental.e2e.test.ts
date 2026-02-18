import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { MockBackend } from "../mock_backend.js";
import { runTests } from "./occt_test_utils.js";

class CountingBackend extends MockBackend {
  executedFeatureIds: string[] = [];

  override execute(input: Parameters<MockBackend["execute"]>[0]) {
    this.executedFeatureIds.push(input.feature.id);
    return super.execute(input);
  }

  resetExec(): void {
    this.executedFeatureIds = [];
  }
}

const makePart = () =>
  dsl.part("incremental-part", [
    dsl.sketch2d("sketch-base", [{ name: "profile:base", profile: dsl.profileRect(20, 12) }]),
    dsl.extrude(
      "base-extrude",
      dsl.profileRef("profile:base"),
      8,
      "body:main",
      ["sketch-base"]
    ),
    dsl.fillet(
      "edge-fillet",
      dsl.selectorEdge([dsl.predCreatedBy("base-extrude")]),
      1,
      ["base-extrude"]
    ),
  ]);

const tests = [
  {
    name: "executor: incremental run can reuse feature prefix",
    fn: async () => {
      const backend = new CountingBackend();
      const part = makePart();
      const full = buildPart(part, backend);
      assert.deepEqual(backend.executedFeatureIds, ["sketch-base", "base-extrude", "edge-fillet"]);

      backend.resetExec();
      const incremental = buildPart(
        part,
        backend,
        undefined,
        undefined,
        undefined,
        {
          incremental: {
            previous: full,
            changedFeatureIds: ["edge-fillet"],
          },
        }
      );
      assert.deepEqual(backend.executedFeatureIds, ["edge-fillet"]);
      assert.equal(incremental.diagnostics.mode, "incremental");
      assert.deepEqual(incremental.diagnostics.reusedFeatureIds, ["sketch-base", "base-extrude"]);
      assert.deepEqual(incremental.diagnostics.invalidatedFeatureIds, ["edge-fillet"]);
    },
  },
  {
    name: "executor: incremental run re-executes downstream dependents",
    fn: async () => {
      const backend = new CountingBackend();
      const part = makePart();
      const full = buildPart(part, backend);
      assert.equal(full.order.length, 3);

      backend.resetExec();
      const incremental = buildPart(
        part,
        backend,
        undefined,
        undefined,
        undefined,
        {
          incremental: {
            previous: full,
            changedFeatureIds: ["base-extrude"],
          },
        }
      );
      assert.deepEqual(backend.executedFeatureIds, ["base-extrude", "edge-fillet"]);
      assert.equal(incremental.diagnostics.mode, "incremental");
      assert.deepEqual(incremental.diagnostics.reusedFeatureIds, ["sketch-base"]);
      assert.deepEqual(incremental.diagnostics.invalidatedFeatureIds, [
        "base-extrude",
        "edge-fillet",
      ]);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

