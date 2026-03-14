import assert from "node:assert/strict";
import type { Backend } from "../backend.js";
import type { IntentPart } from "../dsl.js";
import type { KernelObject, KernelResult } from "../backend.js";
import { buildPart } from "../executor.js";
import { assertValidShape, countEdges, countFaces, countSolids } from "./occt_test_utils.js";

export type GeometryCase = {
  id: string;
  label: string;
  part: IntentPart;
  targetOutput?: string;
};

export type GeometryBaseline = {
  targetOutput: string;
  kind: KernelObject["kind"];
  faces: number;
  edges: number;
  solids: number;
  extent: [number, number, number];
  area?: number;
  volume?: number;
  length?: number;
  surfaceTypes?: Record<string, number>;
};

export type GeometryBaselineFixture = {
  version: 1;
  examples: Record<string, GeometryBaseline>;
  parts: Record<string, GeometryBaseline>;
};

export type GeometrySummary = GeometryBaseline;

type NumericField = "area" | "volume" | "length";

const SCALAR_TOLERANCE_ABS = 0.05;
const SCALAR_TOLERANCE_REL = 1e-5;
const EXTENT_TOLERANCE_ABS = 0.02;
const EXTENT_TOLERANCE_REL = 1e-5;

export function buildGeometryCaseSummary(
  occt: any,
  backend: Backend,
  geometryCase: GeometryCase
): { result: ReturnType<typeof buildPart>; summary: GeometrySummary } {
  const result = buildPart(geometryCase.part, backend);
  const outputKey = resolveGeometryOutputKey(result.final, geometryCase.targetOutput);
  const output = result.final.outputs.get(outputKey);
  assert.ok(output, `Missing ${outputKey} output for ${geometryCase.label}`);
  const shape = output.meta["shape"] as any;
  assert.ok(shape, `Missing shape metadata for ${geometryCase.label}`);
  assertValidShape(occt, shape, geometryCase.label);

  const summary: GeometrySummary = {
    targetOutput: outputKey,
    kind: output.kind,
    faces: countFaces(occt, shape),
    edges: countEdges(occt, shape),
    solids: countSolids(occt, shape),
    extent: shapeExtent(occt, shape),
    surfaceTypes: targetSurfaceTypes(result.final, outputKey),
  };

  if (output.kind !== "edge") {
    const area = measureSurfaceArea(occt, shape);
    if (area !== undefined) summary.area = area;
  }

  if (output.kind === "solid") {
    const volume = measureVolume(occt, shape);
    if (volume !== undefined) summary.volume = volume;
  } else if (output.kind === "edge") {
    const length = measureLength(occt, shape);
    if (length !== undefined) summary.length = length;
  }

  return { result, summary };
}

export function assertGeometryBaseline(
  actual: GeometrySummary,
  expected: GeometryBaseline,
  label: string
): void {
  assert.equal(
    actual.targetOutput,
    expected.targetOutput,
    `${label}: target output changed`
  );
  assert.equal(actual.kind, expected.kind, `${label}: output kind changed`);
  assert.equal(actual.faces, expected.faces, `${label}: face count changed`);
  assert.equal(actual.edges, expected.edges, `${label}: edge count changed`);
  assert.equal(actual.solids, expected.solids, `${label}: solid count changed`);

  for (let index = 0; index < 3; index += 1) {
    assertNear(
      actual.extent[index] ?? Number.NaN,
      expected.extent[index] ?? Number.NaN,
      `${label}: extent[${index}]`,
      EXTENT_TOLERANCE_ABS,
      EXTENT_TOLERANCE_REL
    );
  }

  assertOptionalScalar(actual, expected, "area", label);
  assertOptionalScalar(actual, expected, "volume", label);
  assertOptionalScalar(actual, expected, "length", label);

  assert.deepEqual(
    actual.surfaceTypes ?? {},
    expected.surfaceTypes ?? {},
    `${label}: target face surface types changed`
  );
}

export function resolveGeometryOutputKey(
  result: KernelResult,
  preferred?: string
): string {
  if (preferred && result.outputs.has(preferred)) return preferred;
  const fallbacks = ["body:main", "surface:main", "surface:wall", "curve:main"];
  for (const key of fallbacks) {
    if (result.outputs.has(key)) return key;
  }
  const outputKeys = Array.from(result.outputs.keys());
  if (outputKeys.length === 1) return outputKeys[0] as string;
  throw new Error(
    `Unable to resolve target output from [${outputKeys.join(", ")}]`
  );
}

function targetSurfaceTypes(
  result: KernelResult,
  targetOutput: string
): Record<string, number> {
  const faceSelections = result.selections.filter(
    (selection) => selection.kind === "face" && selection.meta["ownerKey"] === targetOutput
  );
  const uniqueSelections = new Map(faceSelections.map((selection) => [selection.id, selection]));
  const counts: Record<string, number> = {};
  for (const selection of uniqueSelections.values()) {
    const type =
      typeof selection.meta["surfaceType"] === "string"
        ? (selection.meta["surfaceType"] as string)
        : "unknown";
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

function shapeExtent(occt: any, shape: any): [number, number, number] {
  const BoxCtor = occt.Bnd_Box_1 ?? occt.Bnd_Box;
  if (!BoxCtor || !occt.BRepBndLib?.Add) {
    throw new Error("Bnd_Box not available in OCCT module");
  }
  const box = new BoxCtor();
  occt.BRepBndLib.Add(shape, box, true);
  const min = pointToArray(box.CornerMin());
  const max = pointToArray(box.CornerMax());
  return [
    roundMetric(max[0] - min[0]),
    roundMetric(max[1] - min[1]),
    roundMetric(max[2] - min[2]),
  ];
}

function measureVolume(occt: any, shape: any): number | undefined {
  if (!occt.GProp_GProps_1 || !occt.BRepGProp?.VolumeProperties_1) {
    return undefined;
  }
  try {
    const props = new occt.GProp_GProps_1();
    occt.BRepGProp.VolumeProperties_1(shape, props, true, true, true);
    const volume = typeof props.Mass === "function" ? props.Mass() : Number.NaN;
    return Number.isFinite(volume) ? roundMetric(volume) : undefined;
  } catch {
    return undefined;
  }
}

function measureSurfaceArea(occt: any, shape: any): number | undefined {
  if (!occt.GProp_GProps_1 || !occt.BRepGProp?.SurfaceProperties_1) {
    return undefined;
  }
  try {
    const props = new occt.GProp_GProps_1();
    occt.BRepGProp.SurfaceProperties_1(shape, props, true, true);
    const area = typeof props.Mass === "function" ? props.Mass() : Number.NaN;
    return Number.isFinite(area) ? roundMetric(area) : undefined;
  } catch {
    return undefined;
  }
}

function measureLength(occt: any, shape: any): number | undefined {
  if (!occt.GProp_GProps_1 || !occt.BRepGProp?.LinearProperties_1) {
    return undefined;
  }
  try {
    const props = new occt.GProp_GProps_1();
    occt.BRepGProp.LinearProperties_1(shape, props, true);
    const length = typeof props.Mass === "function" ? props.Mass() : Number.NaN;
    return Number.isFinite(length) ? roundMetric(length) : undefined;
  } catch {
    return undefined;
  }
}

function assertOptionalScalar(
  actual: GeometrySummary,
  expected: GeometryBaseline,
  field: NumericField,
  label: string
): void {
  const actualValue = actual[field];
  const expectedValue = expected[field];
  assert.equal(
    actualValue === undefined,
    expectedValue === undefined,
    `${label}: ${field} presence changed`
  );
  if (actualValue === undefined || expectedValue === undefined) {
    return;
  }
  assertNear(
    actualValue,
    expectedValue,
    `${label}: ${field}`,
    SCALAR_TOLERANCE_ABS,
    SCALAR_TOLERANCE_REL
  );
}

function assertNear(
  actual: number,
  expected: number,
  label: string,
  absoluteTolerance: number,
  relativeTolerance: number
): void {
  const tolerance = Math.max(
    absoluteTolerance,
    Math.abs(expected) * relativeTolerance
  );
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual} (tol=${tolerance})`
  );
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pointToArray(point: any): [number, number, number] {
  if (typeof point.X === "function") {
    return [point.X(), point.Y(), point.Z()];
  }
  if (typeof point.x === "function") {
    return [point.x(), point.y(), point.z()];
  }
  throw new Error("Unsupported point type");
}
