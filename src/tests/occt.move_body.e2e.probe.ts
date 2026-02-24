import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { assertValidShape, getBackendContext, runTests } from "./occt_test_utils.js";

function approxEqual(actual: number, expected: number, eps = 1e-4): boolean {
  return Math.abs(actual - expected) <= eps;
}

function getSolidCenter(result: ReturnType<typeof buildPart>, ownerKey: string): [number, number, number] {
  const selection = result.final.selections.find(
    (entry) =>
      entry.kind === "solid" &&
      typeof entry.meta["ownerKey"] === "string" &&
      entry.meta["ownerKey"] === ownerKey
  );
  assert.ok(selection, `missing solid selection for ${ownerKey}`);
  const center = selection.meta["center"];
  assert.ok(Array.isArray(center) && center.length === 3, `missing center for ${ownerKey}`);
  return [Number(center[0]), Number(center[1]), Number(center[2])];
}

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

const tests = [
  {
    name: "occt parity probe: move body translation supports copy semantics",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("move-body-translate-probe", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(10, 6) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 4, "body:main", [
          "sketch-base",
        ]),
        dsl.moveBody(
          "move-body",
          dsl.selectorNamed("body:main"),
          "body:moved",
          ["base-extrude"],
          { translation: [12, -3, 5] }
        ),
      ]);

      const result = buildPart(part, backend);
      const source = result.final.outputs.get("body:main");
      const moved = result.final.outputs.get("body:moved");
      assert.ok(source, "missing source body");
      assert.ok(moved, "missing moved body");

      const sourceShape = source.meta["shape"] as any;
      const movedShape = moved.meta["shape"] as any;
      assertValidShape(occt, sourceShape, "move body source");
      assertValidShape(occt, movedShape, "move body result");

      const sourceCenter = getSolidCenter(result, "body:main");
      const movedCenter = getSolidCenter(result, "body:moved");
      assert.ok(approxEqual(movedCenter[0] - sourceCenter[0], 12));
      assert.ok(approxEqual(movedCenter[1] - sourceCenter[1], -3));
      assert.ok(approxEqual(movedCenter[2] - sourceCenter[2], 5));
    },
  },
  {
    name: "occt parity probe: move body rotation + scale apply around origin",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("move-body-rotate-scale-probe", [
        dsl.sketch2d("sketch-base", [
          {
            name: "profile:base",
            profile: dsl.profileRect(8, 4, [10, 0, 0]),
          },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 6, "body:main", [
          "sketch-base",
        ]),
        dsl.moveBody(
          "move-body",
          dsl.selectorNamed("body:main"),
          "body:scaled-rotated",
          ["base-extrude"],
          {
            rotationAxis: "+Z",
            rotationAngle: Math.PI / 2,
            scale: 1.5,
            origin: [0, 0, 0],
          }
        ),
      ]);

      const result = buildPart(part, backend);
      const source = result.final.outputs.get("body:main");
      const transformed = result.final.outputs.get("body:scaled-rotated");
      assert.ok(source, "missing source body");
      assert.ok(transformed, "missing transformed body");

      const sourceShape = source.meta["shape"] as any;
      const transformedShape = transformed.meta["shape"] as any;
      assertValidShape(occt, sourceShape, "move body source");
      assertValidShape(occt, transformedShape, "move body transformed");

      const sourceVolume = solidVolume(occt, sourceShape);
      const transformedVolume = solidVolume(occt, transformedShape);
      const ratio = transformedVolume / sourceVolume;
      assert.ok(
        approxEqual(ratio, 1.5 * 1.5 * 1.5, 1e-2),
        `expected volume scale ratio ~3.375, got ${ratio}`
      );

      const sourceCenter = getSolidCenter(result, "body:main");
      const transformedCenter = getSolidCenter(result, "body:scaled-rotated");
      const sourceRadius = Math.hypot(sourceCenter[0], sourceCenter[1]);
      const transformedRadius = Math.hypot(transformedCenter[0], transformedCenter[1]);
      assert.ok(
        approxEqual(transformedRadius / sourceRadius, 1.5, 1e-2),
        `expected radial scale ratio ~1.5, got ${transformedRadius / sourceRadius}`
      );
    },
  },
  {
    name: "occt parity probe: move body produces deterministic output across repeated runs",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("move-body-determinism-probe", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(12, 7) },
        ]),
        dsl.extrude("base-extrude", dsl.profileRef("profile:base"), 5, "body:main", [
          "sketch-base",
        ]),
        dsl.moveBody(
          "move-body",
          dsl.selectorNamed("body:main"),
          "body:moved",
          ["base-extrude"],
          {
            translation: [4, -2, 3],
            rotationAxis: "+Z",
            rotationAngle: Math.PI / 5,
            scale: 1.1,
            origin: [0, 0, 0],
          }
        ),
      ]);

      const first = buildPart(part, backend);
      const second = buildPart(part, backend);
      const firstOutput = first.final.outputs.get("body:moved");
      const secondOutput = second.final.outputs.get("body:moved");
      assert.ok(firstOutput, "missing first moved body");
      assert.ok(secondOutput, "missing second moved body");

      const firstShape = firstOutput.meta["shape"] as any;
      const secondShape = secondOutput.meta["shape"] as any;
      assertValidShape(occt, firstShape, "first deterministic shape");
      assertValidShape(occt, secondShape, "second deterministic shape");

      const firstVolume = solidVolume(occt, firstShape);
      const secondVolume = solidVolume(occt, secondShape);
      assert.ok(
        approxEqual(firstVolume, secondVolume, 1e-6),
        `expected deterministic volume (${firstVolume} vs ${secondVolume})`
      );

      const firstCenter = getSolidCenter(first, "body:moved");
      const secondCenter = getSolidCenter(second, "body:moved");
      assert.ok(approxEqual(firstCenter[0], secondCenter[0], 1e-6));
      assert.ok(approxEqual(firstCenter[1], secondCenter[1], 1e-6));
      assert.ok(approxEqual(firstCenter[2], secondCenter[2], 1e-6));
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
