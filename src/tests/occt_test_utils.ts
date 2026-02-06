import initOpenCascade from "opencascade.js/dist/node.js";
import { OcctBackend } from "../backend_occt.js";

export type BackendContext = { occt: any; backend: OcctBackend };

let backendContextPromise: Promise<BackendContext> | null = null;

export async function getBackendContext(): Promise<BackendContext> {
  if (!backendContextPromise) {
    backendContextPromise = (async () => {
      const occt = await initOpenCascade();
      const backend = new OcctBackend({ occt });
      return { occt, backend };
    })();
  }
  return backendContextPromise;
}

export function countFaces(occt: any, shape: any): number {
  const explorer = new occt.TopExp_Explorer_1();
  explorer.Init(
    shape,
    occt.TopAbs_ShapeEnum.TopAbs_FACE,
    occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  let faceCount = 0;
  for (; explorer.More(); explorer.Next()) faceCount += 1;
  return faceCount;
}

export function countSolids(occt: any, shape: any): number {
  const explorer = new occt.TopExp_Explorer_1();
  explorer.Init(
    shape,
    occt.TopAbs_ShapeEnum.TopAbs_SOLID,
    occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  let solidCount = 0;
  for (; explorer.More(); explorer.Next()) solidCount += 1;
  return solidCount;
}

export function assertValidShape(occt: any, shape: any, label = "shape"): void {
  if (!occt.BRepCheck_Analyzer) {
    throw new Error("BRepCheck_Analyzer not available in OCCT module");
  }
  let analyzer: any;
  try {
    analyzer = new occt.BRepCheck_Analyzer(shape, true, true);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to construct BRepCheck_Analyzer: ${msg}`);
  }
  const isValid =
    typeof analyzer.IsValid_2 === "function"
      ? analyzer.IsValid_2()
      : typeof analyzer.IsValid_1 === "function"
        ? analyzer.IsValid_1(shape)
        : undefined;
  if (isValid !== true) {
    throw new Error(`Expected ${label} to be valid, got ${String(isValid)}`);
  }
}

export function assertPositiveVolume(
  occt: any,
  shape: any,
  label = "shape"
): void {
  if (!occt.GProp_GProps_1 || !occt.BRepGProp?.VolumeProperties_1) {
    throw new Error("Volume properties API not available in OCCT module");
  }
  const props = new occt.GProp_GProps_1();
  occt.BRepGProp.VolumeProperties_1(shape, props, true, true, true);
  const volume = typeof props.Mass === "function" ? props.Mass() : undefined;
  if (typeof volume !== "number" || !(volume > 0)) {
    throw new Error(`Expected ${label} to have positive volume, got ${String(volume)}`);
  }
}

export type TestCase = {
  name: string;
  fn: () => Promise<void>;
};

async function runTest(index: number, testCase: TestCase): Promise<boolean> {
  try {
    await testCase.fn();
    console.log(`ok ${index} - ${testCase.name}`);
    return true;
  } catch (err) {
    console.log(`not ok ${index} - ${testCase.name}`);
    console.error(err);
    return false;
  }
}

export async function runTests(testCases: TestCase[]): Promise<void> {
  console.log("TAP version 13");
  let passCount = 0;
  for (const [index, testCase] of testCases.entries()) {
    const ok = await runTest(index + 1, testCase);
    if (ok) passCount += 1;
  }
  console.log(`1..${testCases.length}`);
  if (passCount !== testCases.length) {
    process.exitCode = 1;
  }
}
