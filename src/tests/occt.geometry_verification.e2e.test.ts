import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dslFeatureExamples } from "../examples/dsl_feature_examples.js";
import { partRegistry } from "../examples/parts/registry.js";
import type { GeometryBaselineFixture, GeometryCase } from "./geometry_verification_harness.js";
import {
  assertGeometryBaseline,
  buildGeometryCaseSummary,
} from "./geometry_verification_harness.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const exampleTargetOverrides = new Map<string, string>([
  ["boolean-intersect", "body:main"],
  ["curve-intersect", "curve:main"],
  ["unwrap-box", "surface:flat"],
]);

const exampleCases: GeometryCase[] = dslFeatureExamples
  .filter((entry) => !entry.id.startsWith("selection-ledger-"))
  .map((entry) => ({
    id: entry.id,
    label: `example ${entry.id}`,
    part: entry.part,
    targetOutput:
      exampleTargetOverrides.get(entry.id) ?? entry.render?.layers?.[0]?.output,
  }));

const partCases: GeometryCase[] = partRegistry.map((entry) => ({
  id: entry.id,
  label: `part ${entry.id}`,
  part: entry.part,
  targetOutput: "body:main",
}));

const tests = [
  {
    name: "occt geometry verification: example and part baselines stay stable",
    fn: async () => {
      const fixturePath = path.resolve("src/tests/fixtures/geometry_baseline.json");
      const baseline = JSON.parse(
        await readFile(fixturePath, "utf8")
      ) as GeometryBaselineFixture;
      const { occt, backend } = await getBackendContext();

      for (const geometryCase of exampleCases) {
        const expected = baseline.examples[geometryCase.id];
        assert.ok(expected, `Missing example baseline for ${geometryCase.id}`);
        const { summary } = buildGeometryCaseSummary(occt, backend, geometryCase);
        assertGeometryBaseline(summary, expected, geometryCase.label);
      }

      for (const geometryCase of partCases) {
        const expected = baseline.parts[geometryCase.id];
        assert.ok(expected, `Missing part baseline for ${geometryCase.id}`);
        const { summary } = buildGeometryCaseSummary(occt, backend, geometryCase);
        assertGeometryBaseline(summary, expected, geometryCase.label);
      }
    },
  },
  {
    name: "occt geometry verification: variable edge operations materially change the seed body",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const variableFillet = exampleCases.find((entry) => entry.id === "variable-fillet");
      const variableChamfer = exampleCases.find((entry) => entry.id === "variable-chamfer");
      assert.ok(variableFillet, "missing variable fillet case");
      assert.ok(variableChamfer, "missing variable chamfer case");

      const filletSeedSummary = buildGeometryCaseSummary(occt, backend, {
        ...variableFillet,
        targetOutput: "body:main",
      }).summary;
      const filletTargetSummary = buildGeometryCaseSummary(occt, backend, {
        ...variableFillet,
        targetOutput: "body:filleted",
      }).summary;
      assert.ok(
        (filletTargetSummary.volume ?? Number.POSITIVE_INFINITY) <
          (filletSeedSummary.volume ?? Number.NEGATIVE_INFINITY),
        `expected variable fillet to reduce seed volume (${filletTargetSummary.volume} vs ${filletSeedSummary.volume})`
      );

      const chamferSeedSummary = buildGeometryCaseSummary(occt, backend, {
        ...variableChamfer,
        targetOutput: "body:main",
      }).summary;
      const chamferTargetSummary = buildGeometryCaseSummary(occt, backend, {
        ...variableChamfer,
        targetOutput: "body:chamfered",
      }).summary;
      assert.ok(
        (chamferTargetSummary.volume ?? Number.POSITIVE_INFINITY) <
          (chamferSeedSummary.volume ?? Number.NEGATIVE_INFINITY),
        `expected variable chamfer to reduce seed volume (${chamferTargetSummary.volume} vs ${chamferSeedSummary.volume})`
      );
    },
  },
  {
    name: "occt geometry verification: boolean intersect output is smaller than both operands",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const geometryCase = exampleCases.find((entry) => entry.id === "boolean-intersect");
      assert.ok(geometryCase, "missing boolean intersect case");

      const bodyASummary = buildGeometryCaseSummary(occt, backend, {
        ...geometryCase,
        targetOutput: "body:a",
      }).summary;
      const bodyBSummary = buildGeometryCaseSummary(occt, backend, {
        ...geometryCase,
        targetOutput: "body:b",
      }).summary;
      const intersectionSummary = buildGeometryCaseSummary(occt, backend, {
        ...geometryCase,
        targetOutput: "body:main",
      }).summary;

      assert.ok(
        (intersectionSummary.volume ?? 0) > 0,
        "expected boolean intersection to preserve positive volume"
      );
      assert.ok(
        (intersectionSummary.volume ?? Number.POSITIVE_INFINITY) <
          (bodyASummary.volume ?? Number.NEGATIVE_INFINITY),
        "expected intersection volume to be smaller than operand A"
      );
      assert.ok(
        (intersectionSummary.volume ?? Number.POSITIVE_INFINITY) <
          (bodyBSummary.volume ?? Number.NEGATIVE_INFINITY),
        "expected intersection volume to be smaller than operand B"
      );
    },
  },
  {
    name: "occt geometry verification: unwrap preserves total surface area",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const geometryCase = exampleCases.find((entry) => entry.id === "unwrap-box");
      assert.ok(geometryCase, "missing unwrap-box case");

      const sourceSummary = buildGeometryCaseSummary(occt, backend, {
        ...geometryCase,
        targetOutput: "body:main",
      }).summary;
      const flatSummary = buildGeometryCaseSummary(occt, backend, {
        ...geometryCase,
        targetOutput: "surface:flat",
      }).summary;
      assert.equal(flatSummary.kind, "face");
      assert.ok(sourceSummary.area !== undefined, "missing source area");
      assert.ok(flatSummary.area !== undefined, "missing flat area");
      assert.ok(
        Math.abs((sourceSummary.area ?? 0) - (flatSummary.area ?? 0)) <= 0.05,
        `expected unwrap surface area parity (${sourceSummary.area} vs ${flatSummary.area})`
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
