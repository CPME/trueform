import initOpenCascade from "opencascade.js/dist/node.js";
import { OcctBackend } from "../index.js";

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
