import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertPositiveVolume,
  assertValidShape,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

function solidVolume(occt: any, shape: any): number {
  if (!occt.GProp_GProps_1 || !occt.BRepGProp?.VolumeProperties_1) {
    throw new Error("Volume properties API not available in OCCT module");
  }
  const props = new occt.GProp_GProps_1();
  occt.BRepGProp.VolumeProperties_1(shape, props, true, true, true);
  const volume = typeof props.Mass === "function" ? props.Mass() : Number.NaN;
  if (!Number.isFinite(volume) || volume <= 0) {
    throw new Error(`Expected positive volume, got ${String(volume)}`);
  }
  return volume;
}

function hollowBodyFeatures() {
  return [
    dsl.extrude("outer", dsl.profileRect(40, 40), 20, "body:outer"),
    dsl.extrude("inner-tool", dsl.profileRect(16, 16, [0, 0, 6]), 8, "body:inner", ["outer"]),
    dsl.booleanOp(
      "hollow",
      "subtract",
      dsl.selectorNamed("body:outer"),
      dsl.selectorNamed("body:inner"),
      "body:main",
      ["inner-tool"]
    ),
  ];
}

function buildHoleWizardPart(endCondition: "throughAll" | "upToNext" | "upToLast") {
  const topFace = dsl.selectorFace(
    [dsl.predCreatedBy("hollow"), dsl.predPlanar()],
    [dsl.rankMaxZ()]
  );
  const hole =
    endCondition === "throughAll"
      ? dsl.holeWizard("hole-wizard", topFace, "-Z", 6, {
          endCondition: "throughAll",
          standard: "ISO",
          series: "M",
          size: "M6",
          fitClass: "H11",
          deps: ["hollow"],
        })
      : dsl.holeWizard("hole-wizard", topFace, "-Z", 6, {
          depth: 1,
          endCondition,
          standard: "ISO",
          series: "M",
          size: "M6",
          fitClass: "H11",
          deps: ["hollow"],
        });
  return dsl.part(`hole-wizard-${endCondition}`, [...hollowBodyFeatures(), hole]);
}

const tests = [
  {
    name: "occt parity probe: hole wizard upToNext/upToLast resolve different cut depths",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const baselinePart = dsl.part("hole-wizard-baseline", hollowBodyFeatures());
      const baselineResult = buildPart(baselinePart, backend);
      const nextResult = buildPart(buildHoleWizardPart("upToNext"), backend);
      const lastResult = buildPart(buildHoleWizardPart("upToLast"), backend);
      const throughResult = buildPart(buildHoleWizardPart("throughAll"), backend);

      const baselineOutput = baselineResult.final.outputs.get("body:main");
      const nextOutput = nextResult.final.outputs.get("body:main");
      const lastOutput = lastResult.final.outputs.get("body:main");
      const throughOutput = throughResult.final.outputs.get("body:main");
      assert.ok(baselineOutput, "missing baseline output");
      assert.ok(nextOutput, "missing upToNext output");
      assert.ok(lastOutput, "missing upToLast output");
      assert.ok(throughOutput, "missing throughAll output");

      const baselineShape = baselineOutput.meta["shape"] as any;
      const nextShape = nextOutput.meta["shape"] as any;
      const lastShape = lastOutput.meta["shape"] as any;
      const throughShape = throughOutput.meta["shape"] as any;
      assertValidShape(occt, baselineShape, "hole wizard baseline");
      assertValidShape(occt, nextShape, "hole wizard upToNext");
      assertValidShape(occt, lastShape, "hole wizard upToLast");
      assertValidShape(occt, throughShape, "hole wizard throughAll");
      assertPositiveVolume(occt, nextShape, "hole wizard upToNext");
      assertPositiveVolume(occt, lastShape, "hole wizard upToLast");
      assertPositiveVolume(occt, throughShape, "hole wizard throughAll");

      const baselineVolume = solidVolume(occt, baselineShape);
      const nextVolume = solidVolume(occt, nextShape);
      const lastVolume = solidVolume(occt, lastShape);
      const throughVolume = solidVolume(occt, throughShape);
      const removedNext = baselineVolume - nextVolume;
      const removedLast = baselineVolume - lastVolume;
      const removedThrough = baselineVolume - throughVolume;
      assert.ok(removedNext > 0, `expected upToNext to remove material, got ${removedNext}`);
      assert.ok(
        removedLast > removedNext * 1.5,
        `expected upToLast to remove more than upToNext (${removedLast} vs ${removedNext})`
      );
      assert.ok(
        removedThrough > removedNext * 1.5,
        `expected throughAll to remove more than upToNext (${removedThrough} vs ${removedNext})`
      );
      const throughVsLastRel = Math.abs(removedThrough - removedLast) / removedLast;
      assert.ok(
        throughVsLastRel <= 0.35,
        `expected throughAll and upToLast to be similar (rel diff=${throughVsLastRel})`
      );
    },
  },
  {
    name: "occt parity probe: hole wizard threaded profile requests fail with explicit error",
    fn: async () => {
      const { backend } = await getBackendContext();
      const topFace = dsl.selectorFace(
        [dsl.predCreatedBy("hollow"), dsl.predPlanar()],
        [dsl.rankMaxZ()]
      );
      const part = dsl.part("hole-wizard-threaded-unsupported", [
        ...hollowBodyFeatures(),
        dsl.holeWizard("hole-wizard", topFace, "-Z", 6, {
          depth: 4,
          endCondition: "blind",
          standard: "ISO",
          series: "M",
          size: "M6",
          threadClass: "6H",
          threaded: true,
          deps: ["hollow"],
        }),
      ]);
      assert.throws(
        () => buildPart(part, backend),
        /threaded profiles are not yet supported/i
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
